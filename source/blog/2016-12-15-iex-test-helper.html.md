---
title: IEx Test Helper
date: 2016-12-15
category: til
---

This week at [Chicago Elixir](https://www.meetup.com/ChicagoElixir/) we were paring on some [Exercism](http://exercism.io/languages/elixir/about). [Dorian Karter](https://twitter.com/dorian_escplan) was looking for a way to run ExUnit tests inside of IEx without mix.  Surely there must be a way! After some research I came up with this nugget.

~~~elixir
#.iex.exs
defmodule TestHelper do
  @moduledoc false

  @doc"""
  Reloads files and runs ExUnit tests in the pwd
  """
  def run_tests(opts \\ []) do
    respawn

    clear? = Keyword.get(opts, :clear, false)
    if clear?, do: clear

    Code.compiler_options(ignore_module_conflict: true)
    Path.wildcard("*_test.exs")
    |> Enum.map(& Code.load_file &1)

    ExUnit.Server.cases_loaded
    ExUnit.run
  end
end
~~~

This assumes that the `*_test.exs` files in the pwd load the required modules first. Just plop this file in the pwd or in your home directory to obtain access to it in IEx.  Happy testing!
