---
title: What is GenServer?
date: "2016-02-18 12:00:00 -0600"
category: til
---

Erlang is highly valued for it's concurrency model, and the OTP framework provides
several 'behaviours' for building a current system. One such behaviour is the
generic server process or gen_server. Generic server processes are an
abstraction for the server side of client-server interactions.

Elixir provides the module GenServer for creating such processes. This module
provides the same functionality of the Erlang behaviour. All one needs to do to
utilize GenServer is to implement some callbacks. Heres a simple example:

~~~elixir
defmodule MyServer do
  use GenServer

  # Client

  def start() do
    GenServer.start(__MODULE__, nil)
  end

  def start(name) do
    GenServer.start(__MODULE__, nil, name: name)
  end

  def init(_) do
    {:ok, Map.new}
  end

  def get(pid, key) do
    GenServer.call(pid, {:get, key})
  end

  def put(pid, key, value) do
    GenServer.cast(pid, {:put, key, value})
  end

  # Server

  def handle_cast({:put, key, value}, state) do
    {:noreply, Map.put(state, key, value)}
  end

  def handle_call({:get, key}, state) do
    {:reply, Map.get(state, key), state}
  end
end
~~~

We define a our module and use GenServer. Using GenServer sets up the 6 required
callbacks for a generic server process, leaving us to define/overwrite the
defaults.

So what does the code above do exactly?

start/2 && start/3
------------------

Starts the server, giving it an optional name that will be registered
locally on the BEAM instance. The name can then be used in place of the pid.

init/1
------

Invoked when the server is started with start/2 or start/3. Initializes our map,
the datastructure that will handle the state.

handle_cast/2
-------------

A required callback for GenServer that handles asynchronous (fire and forget)
requests.  Casts do not send a reply to the client, therefore it is non blocking.

handle_call/2
-------------

A required callback for GenServer that handles synchronous requests. Call does
block the caller so it should only be used when we need confirmation or to return
a value.
