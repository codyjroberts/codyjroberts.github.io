---
title: Streams, Enums, and Protocols!
date: "2016-02-05 12:00:00 -0600"
category: article
---

I was initially very confused about the difference between the Enum and Stream
modules in Elixir. If you're also confused, hopefully this short post should
clear it up for you.

Enumerable protocol
-------------------

Protocols, as defined by elixir-lang.org, are a mechanism to achieve
polymorphism in Elixir. The Enumerable protocol is a built-in protocol that is
shipped with the language. Both the Enum and Stream modules implement the
Enumerable protocol. To put it simply, this means that they both rely on the same 
standards and can be used in the same manner. Below you can see the
implementation of both Enum.map and Stream.map. Notice the use of the lazy function
in Stream.map. Lazy, also shown below, returns a Stream struct for later use.

~~~elixir
#Enum.map
@spec map(t, (element -> any)) :: list
def map(collection, fun) when is_list(collection) do
  for item <- collection, do: fun.(item)
end

def map(collection, fun) do
  Enumerable.reduce(collection, {:cont, []}, R.map(fun)) |> elem(1) |> :lists.reverse
end

#Stream.map
@spec map(Enumerable.t, (element -> any)) :: Enumerable.t
def map(enum, fun) do
  lazy enum, fn(f1) -> R.map(fun, f1) end
end

defp lazy(enum, fun), do: %Stream{enum: enum, funs: [fun]}
~~~



Lazy Evaluation
---------------

Ok, I see it, but what does it mean? Lazy evaluation is a strategy that delays
the evaluation of an expression until the value is needed. This is opposed to
the eager evaluation strategy, often called strict or greedy evaluation. Eager
evaluation, which is the traditional approach taken by most programming languages,
evaluates the expression as soon as it is assigned to a variable. The docs for
Stream give an easy to understand example of this.


~~~elixir
range = 1..3
stream = Stream.map(range, &(&1 * 2))
Enum.map(stream, &(&1 + 1))
[3,5,7]
~~~

When using Stream.map the range does not get evaluated. The stream variable is
matched to resulted %Stream{} struct on the right hand side which contains the
enum and the function to run on it. It isn't until Enum.map is executed that the
range is evaluated and each item is multiplied by 2 and added to 1. This way we
can prolong computation until the point that it is needed.

This can have a performance increase in some cases when we want to perform many
transformations on a collection. Using Enum to pipe multiple transformations, a
new list would be made at each transformation. If this collection is very large
this could be very expensive. On the other hand if we use Stream to compose the
transformations, we can build a series of transformations that aren't performed
until the end. 

Note: Streams are only evaluated when you call a function from the Enum module on it.
