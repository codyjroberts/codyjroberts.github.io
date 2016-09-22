---
title: Elixir Structs
date: "2016-02-08 12:00:00 -0600"
category: til
---

Elixir structs are built on top of Maps, a key/value pair data structure.
Structs provide helpful features such as default values and compile time errors.

Structs are usually defined using the defstruct/1 inside of a module.

~~~elixir
defmodule Kitty do
  defstruct name: nil, age: nil, breed: nil
  #defstruct [:name, :age, :breed]
end
~~~

defstruct/1 takes a key/value list where the values are the defaults. If you
happen to be defaulting to nil for every field, you can use the alternative
syntax on the second line that only provides the keys.

You can access a struct in the same way as a Map, except it's defined by its
module name:

~~~elixir
iex(3)> meow = %Kitty{name: "Floyd"}
%Kitty{age: nil, breed: nil, name: "Floyd"}
iex(4)> meow = %Kitty{meow | age: 2}
%Kitty{age: 2, breed: nil, name: "Floyd"}
iex(5)> %Kitty{meow | color: "white"}
** (CompileError) iex:5: unknown key :color for struct Kitty
    (elixir) src/elixir_map.erl:185: :elixir_map."-assert_struct_keys/5-lc$^0/1-0-"/5
    (elixir) src/elixir_map.erl:62: :elixir_map.translate_struct/4
iex(5)>
~~~

As you can see, structs only allow entry of defined keys.

You can also provide a typespec.

~~~elixir
defmodule Kitty do
  defstruct [:name, :age, :breed]

  @type t :: %Kitty{name: String.t, age: non_neg_integer, breed: String.t}
end
~~~
