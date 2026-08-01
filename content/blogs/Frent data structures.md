08/01/2026

This document outlines the implementation details of [Frent](https://github.com/itsBuggingMe/Frent), especially what specific data structures are used and how.

I am assuming you already know what an [ECS](https://github.com/SanderMertens/ecs-faq?tab=readme-ov-file#what-is-ecs) and [EC framework](https://github.com/SanderMertens/ecs-faq?tab=readme-ov-file#how-is-ecs-different-from-entity-component-frameworks) is.

Frent internally is primarily a traditional archetypical ECS that uses source generation and data-oriented design to make a fast and low-to-no allocation EC framework.

Instance methods on components can be thought of as syntactic sugar for a system calling the instance method. There are semantic differences, however. For example, missing components throw an exception (You can use the `[IncludesComponents]` attribute to get around this).

```cs
struct Position(Vector2 XY);
struct Velocity(Vector2 DXY) : IUpdate<Position>
{
    public void Update(ref Position pos) => pos.XY += DXY;
}

World world = new();

// world.Update() performs
world.Query<Position, Velocity>()
    .Delegate((ref Position pos, ref Velocity vel) => vel.Update(ref pos));
```

## The traditional archetypical ECS part

Information in this section is primarily from [here](https://ajmmertens.medium.com/building-an-ecs-1-where-are-my-entities-and-components-63d07c7da742), and will be similar to the implementation details of any other archetypical ecs.

### Archetypes

An archetype is a data structure that stores component data in a cache-efficient manner. A single archetype stores all component data for entities that have a particular set of component types. For example, an entity with components [Position, Velocity, Sprite] will be in a different archetype compared to an entity with components [Position, Velocity]. An archetype can have zero to any N number of entities in it.

You can think of an archetype as a table, where components are stored in columns of contiguous memory, and every row is an entity.

![5 entities, 3 of which have have 4 components, 2 of which have 3](https://raw.githubusercontent.com/itsBuggingMe/itsBuggingMe/refs/heads/main/img/archetype_0.png)
<p align="center">
  <img src="" />
</p>

*Two archetypes & five entities total. Trees and Shrubs don't move, so they don't need to have a velocity component.*

### Adding/removing components

When adding or removing components, component data is moved across archetypes. For example, if we were to add a velocity component to entity 2, it would be copied to the end of the [position, velocity, sprite] archetype.

### The entity table/meta table

The entity table is a large array of metadata that lets the user retrieve component data given an entity id.

Each table entry contains a reference to the archetype the entity is in, the row index of the entity in that archetype, some flags for optimization, and a version/generation so the entity ids can be recycled safely.

Here's what the entity table would look like for the scenario above.

![the entity table. not much to say here.](https://raw.githubusercontent.com/itsBuggingMe/itsBuggingMe/refs/heads/main/img/entity_table_0.png)

Let's say we have entity id 4 and want to get its position. We get the [position, velocity, sprite] archetype from the entity table at index 4. We then look for the velocity component at row index 2, which was also given by the entity table entry.

But how do we get the column index? Each component type is assigned a sequential type id. Every archetype also carries a byte array that maps from a type id to the column index of that type in the archetype. I call this the component map.

The actual field in an archetype is an `Array[]`, which is the closest we can get to a type-erased `void**`.

### Recycling entities

It is imperative that the entity table is a speedy lookup for entity metadata. Thus, an array is perfect for this task. However, as entities are created and deleted, naively creating a unique sequential id for every entity would leak memory as entity ids get ever higher and higher.

To keep id values small, we recycle entity ids. The simplest way to do this is to include a collection of ids from deleted entities and reuse them.

```cs
Stack<int> _recycledIds;
int _nextId;

int GetNewId() => _recyledIds.TryPop(out int i) ? i : _nextId++;
```

However, reusing entity ids directly would cause problems as the user would perceive entities as being deleted, then being "revived" as a functionally different entity with different components.

So we enhance the idea of an entity by also including a version along with the entity id. Every time the same entity id is given out, a unique version number (usually also sequential) is also handed out. The corresponding entry in the entity table then keeps track of the current entity version in use, so given an entity id and a version, one can check if the entity is alive. In Frent, all of this is abstracted within the `Entity` struct.

This pattern is similar to the generational handles/generational indices pattern.

## Frent specifics

### Saving memory with recycling

We can save some memory by using the entity table itself as our collection to store recycled entity ids.

When an entry in the entity table is unused (so its corresponding entity id has been recycled), the archetype index (the row index of the entity within the corresponding archetype) can be repurposed as a link index in a singly linked list.

This shows what the entity table would look like after deleting entities 4, 2, 3 in order:

![do you like randall munroe too?](https://raw.githubusercontent.com/itsBuggingMe/itsBuggingMe/refs/heads/main/img/entity_table_1.png)

### Tags

A tag is like a component, but doesn't store data.

Tag types are also assigned a sequential tag id, and the highest bit of each byte in the component map is reserved as a marker indicating whether this archetype has a tag of that type.

This is also where the limit of 127 components on an entity comes from. The remaining 7 bits can address 128 indices, with index 0 being used as a tombstone value.

### Events

The main goal for events was not to punish the speed and memory usage of not using events, while also not increasing the memory overhead of an entity.
This would allow entities to be used for things as complex as player characters or as simple as particle effects.

To do this, event data is associated with entity ids with a custom dictionary. However, dictionary lookups are slow (~20ns), and just checking if a dictionary contains an entry would punish users who don't use events with that lookup.

To fix this, we use bit flags in entity table entries to indicate whether an entity has an event of a given kind. This way, the only extra cost is a single branch and a bit test.

### Sparse components

The two popular ways to implement an ECS is with archetypes and sparse sets, each with strengths and weaknesses that complement each other.

| Sparse Set | Archetypes |
|------------|------------|
| O(1) and faster Add/Remove/Get | Better cache locality |
| Simpler to implement | Faster to query entities |
| Can perform structural changes any time | SIMD-able |

Components are stored in archetypes by default, but can be optionally placed into sparse sets by implementing the `ISparseComponent` interface. User-wise, there are no visible changes that allow for seamless switching between sparse sets and archetypical storage.

For information on the sparse set data structure itself, see: https://www.geeksforgeeks.org/dsa/sparse-set/.
TLDR: sparse sets can map entity ids to components, where all components of a type are stored contiguously, while maintaining O(1) add, get, and remove

We use the fact that the JIT can perform dead code elimination with `default(T) is ISparseComponent`, since monomorphization of struct generics makes the expression's value known at JIT time.

#### Querying sparse and archetypical components

Querying both sparse and archetypical components is relatively complex to preserve the behavior of both components being the same. In addition, a primary goal of sparse components was not to punish archetypical component only code paths.

Each sparse component also gets its own "sparse component id," which is a sequential id that indexes into the per-world sparse set array and is a bit index. Each sparse entity has a corresponding 256-bit vector. 256 bits were chosen as most computers now support ymm registers. This also limits the global number of sparse components to 256.

The arrays that store these bit vectors are lazily allocated to save memory, and queries/filters build bitsets to match and exclude components. This operation is altogether skipped if no components in a query use sparse components, and is very fast due to the x86 `ptest` instruction. The C++ intrinsic equivalent would be using testc for matching included components and testz for matching excluded components.

### Creating entities during updates

https://www.lohj.me/blog/Creating-Entities-at-Anytime-in-ECS
