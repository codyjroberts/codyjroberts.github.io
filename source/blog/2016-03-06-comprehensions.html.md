---
title: Elixir Comprehensions
date: 2016-03-06T09:51:07-05:00
category: til
---

Comprehensions are a pretty neat little feature of elixir. They allow you to
construct a data structure from one or two enumerables while filtering and
transforming the data.  Here are some examples:


~~~elixir
for x <- [50, 100, 150, 200], do: x - 50
[0, 50, 100, 150]

for {name, age} <- [{"bob", 20}, {"sue", 50}, {"jim", 34}, {"carla", 75}], age < 50, do: name
["bob", "jim"]

for {name, _, "F"} <- [{"bob", 20, "M"}, {"sue", 50, "F"}, {"jim", 34, "M"}, {"carla", 75, "F"}],
    do: name
["sue", "carla"]

for {name, age} <- [{"bob", 20}, {"sue", 50}, {"jim", 34}, {"carla", 75}],
    candy       <- ["goodbar", "snickers", "reeses"],
    age > 40,
    do: {name, candy}
[{"sue", "goodbar"}, {"sue", "snickers"}, {"sue", "reeses"},
 {"carla", "goodbar"}, {"carla", "snickers"}, {"carla", "reeses"}]

for file <- File.ls!, String.contains?(file, ".html"), do: file
["projects.html", "about.html", "404.html", "index.html"]
~~~

As you can see you can pattern match on the enumerables, filter inline, and work
with more than one enumerable at at time.
