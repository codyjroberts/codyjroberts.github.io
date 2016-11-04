---
title: Chowmonger (Phoenix & Ember)
date: 2016-04-15
category: article
---

# Introduction

**Work in Progress (Living Document)**:
Expect issues! I've learned quite a bit since I wrote this for my independent
study back in April. I'll be updating this tutorial to reflect the current
status of the project as soon as I have time. *Until then you can view a
working version [here](https://chowmonger-client.herokuapp.com) -- Jun/08/16*

For this tutorial we'll go step-by-step through the creation of a Phoenix API
and an EmberJS app to consume it.  We'll create a real-time food truck tracker
using Phoenix Channels. We'll design our API for JWT based authentication using
Guardian and produce JSON following the jsonapi.org specification with
ja_serializer. In addition we'll be using ember-simple-auth for sessions and
leaflet.js for our map.

This tutorial assumes that you have some basic knowledge of Elixir,
Javascript, Phoenix, and EmberJS.  A simple perusal of both frameworks'
documentation should be enough.  I don't define everything so it will be helpful
to keep the documentation open while working through the tutorial.

### Versions
Elixir v1.1.2
Phoenix v1.2.3
PostgreSQL 9.4

**Disclaimer**: This is my first time working with Phoenix and EmberJS.  It is very
likely that there are more practical ways to achieve the goals of this application.
Suggestions and critique are welcome and appreciated!

# Phoenix API

The first thing we'll do is initialize our Phoenix application.  We are skipping
brunch, an asset build tool, since we will be doing the front end separately
with EmberJS.

~~~
mix phoenix.new chowmonger --no-brunch
cd truckn
~~~

Install the dependencies when prompted.

We'll be using PostgreSQL for this tutorial.  If you don't have it installed do
a quick Google search to find out how to install it on your system. Open
config/dev.exs to configure the database. I'm on Ubuntu 14.04 and the default
template isn't UTF8. If this is the case for you just specify template0.  You
may want or need to change the username and password.  For this
tutorial I'll be keeping the default postgres username and password.  I also
have PostgreSQL 9.4 installed which uses port 5433 instead of the old 5432
(default). This may be different for your installation.  If you make any
changes, you should probably do so in your config/test.exs file as well.

~~~elixir
#config/dev.exs

# Configure your database
config :truckn, Chowmonger.Repo,
  adapter: Ecto.Adapters.Postgres,
  username: "postgres",
  password: "postgres",
  database: "chowmonger_dev",
  hostname: "localhost",
  template: "template0",
  port: 5433,
  pool_size: 10
~~~

Now we can create our database!  Run the mix task below. It should return a
message saying the database has been created.

~~~bash
mix ecto.create
~~~

Add the ja_serializer library to our dependencies.  ja_serializer provides an
extremely simple way to produce jsonapi.org specification JSON.  I like standards
and EmberJS just so happens promote said specification.

~~~elixir
#mix.exs

defp deps do
  [{:phoenix, "~> 1.2.3"},
    {:phoenix_ecto, "~> 2.0"},
    {:postgrex, ">= 0.0.0"},
    {:phoenix_html, "~> 2.3"},
    {:phoenix_live_reload, "~> 1.0", only: :dev},
    {:gettext, "~> 0.9"},
    {:ja_serializer, "~> 0.8.0"},
    {:cowboy, "~> 1.0"}]
end
~~~

Run mix deps.get to install the library.

Lets configure Plug to accept our json-api MIME type.  And json-api to be
serialized with [Poison](https://github.com/devinus/poisonhttps://github.com/devinus/poison).

~~~elixir
#config/config.exs

# Configure json-api to use Poison
config :phoenix, :format_encoders,
  "json-api": Poison

# Configure Plug for json-api
config :plug, :mimes, %{
  "application/vnd.api+json" => ["json-api"]
}
~~~

In order for this to take effect we'll have to recompile plug.  Don't forget
this step!  Had me really confused when I did.

~~~bash
touch deps/plug/mix.exs
mix deps.compile plug
~~~

Now we will set up our router for json-api, namespaced by version.  We add a few
plugs to the :api pipeline.

**JaSerializer.ContentTypeNegotiation**
to enforce json-api standard content-type/accept headers and add the response
content-type

**JaSerializer.Deserializer**
to normalize attributes to underscores

~~~elixir
#web/router.ex

pipeline :api do
  plug :accepts, ["json-api"]
  plug JaSerializer.ContentTypeNegotiation
  plug JaSerializer.Deserializer
end

scope "/api", Chowmonger do
  pipe_through :api

  scope "/v1" do

  end
end
~~~

Alright now that we have our API configured for json-api spec, let's set up
our models. We'll start with our users.  Let's add Guardian and Comeonin to our
dependencies, we'll use them for authentication and encryption.  We'll also need
to add :comeonin as an application (runtime) dependency.

~~~elixir
#mix.exs

def application do
  [mod: {Chowmonger, []},
    applications: [:phoenix, :phoenix_html, :cowboy, :logger, :gettext,
                  :phoenix_ecto, :postgrex, :comeonin]]
end

...

defp deps do
  [{:phoenix, "~> 1.1.3"},
    {:phoenix_ecto, "~> 2.0"},
    {:postgrex, ">= 0.0.0"},
    {:phoenix_html, "~> 2.3"},
    {:phoenix_live_reload, "~> 1.0", only: :dev},
    {:gettext, "~> 0.9"},
    {:ja_serializer, "~> 0.8.0"},
    {:comeonin, "~> 2.1.0"},
    {:guardian, "~> 0.10.0"},
    {:cowboy, "~> 1.0"}]
end
~~~

You know the drill... mix deps.get to install the dependencies.

Now we can configure Guardian.  Add the following to our config file. We haven't
created our serializer yet but we will shortly.

~~~elixir
#config/config.exs

# Configure guardian
config :guardian, Guardian,
  allowed_algos: ["HS512"],
  verify_module: Guardian.JWT,
  issuer: "Chowmonger",
  ttl: { 30, :days },
  verify_issuer: true,
  secret_key: to_string(Mix.env),
  permissions: %{
    default: [:read, :write]
  },
  serializer: Chowmonger.GuardianSerializer
~~~

Create our users using the handy json generator.  This is similar to scaffold in
the Rails framework. This will scaffold out our migration, model, controller, and
json views. Luxury.

~~~bash
mix phoenix.gen.json API.V1.User users name:string email:string password:string password_hash:string
~~~

We are namespacing our modules here with the API.V1. prefix.  The generator will
tell you to add the following to your route. Don't.

~~~
resources "/api/v1/users", API.V1.UserController, except: [:new, :edit]
~~~

However we're going to do it a bit differently since we're using scope.  Modify
the router to look like the code below.

~~~elixir
#web/router.ex

scope "/api", Chowmonger do
  pipe_through :api

  scope "v1", alias: API.V1 do
    resources "users", UserController, except: [:new, :edit]
  end
end
~~~

Open up our new migration. We'll want to create a unique index for our emails
(login) as well as make our password virtual since we won't be storing it.

~~~elixir
defmodule Chowmonger.Repo.Migrations.CreateUser do
  use Ecto.Migration

  def change do
    create table(:users) do
      add :name, :string, null: false
      add :email, :string, null: false
      add :password, :string, virtual: true
      add :password_hash, :string, null: false

      timestamps
    end

    create unique_index(:users, [:email])
  end
end
~~~

We'll also want to open up the User model to add some constraints and a
function to encrypt the virtual password. First we'll remove password_hash as a
required field.  Then we'll add the following constraints:

~~~elixir
@required_fields ~w(name email password)
@optional_fields ~w()

def changeset(model, params \\ :empty) do
  model
  |> cast(params, @required_fields, @optional_fields)
  |> validate_format(:email, ~r/@/)
  |> validate_length(:password, min: 5)
  |> validate_confirmation(:password, message: "Invalid password")
  |> unique_constraint(:email, message: "Email in use")
  |> generate_password_hash
end

defp generate_password_hash(changeset) do
  case changeset do
    %Ecto.Changeset{valid?: true, changes: %{password: password}} ->
      put_change(changeset, :password_hash, Comeonin.Bcrypt.hashpwsalt(password))
    _ ->
      changeset
  end
end
~~~

generate_password_hash/1 is a simple function that generates an encrypted password
from the given password upon change to the model.

Let's clean up some of this generated mess. Delete the generated Page controller,
view, template, and the associating tests.

For this tutorial our only user will be the admin. Because of this we won't need
most of our User controller, so let's slim that down.  We could have just
created these files ourselves, it's down to preference.  Note the data key in
render/3.

~~~elixir
#web/controllers/api/v1/user_controller.ex
defmodule Chowmonger.API.V1.UserController do
  use Chowmonger.Web, :controller

  alias Chowmonger.API.V1.User

  def index(conn, _params) do
    users = Repo.all(User)
    render(conn, "index.json", data: users)
  end

  def show(conn, %{"id" => id}) do
    user = Repo.get!(User, id)
    render(conn, "show.json", data: user)
  end
end
~~~

Using data as the key in render/3 is required by ja_serializer.  Open web.ex to
configure our routes to use JaSerializer.PhoenixView.

~~~elixir
#web/web.ex

#...

def view do
  quote do
    use Phoenix.View, root: "web/templates"
    use JaSerializer.PhoenixView

    #...
  end
end

#...
~~~

This will make our views much simpler.  Open the new User view and simplify.

~~~
#web/views/api/v1/user_view.ex

defmodule Chowmonger.API.V1.UserView do
  use Chowmonger.Web, :view

  attributes [:name, :email]
end
~~~

Next we'll create our Token controller.  The Token controller will be handing
out our JWTs.

~~~elixir
#web/controllers/api/v1/token_controller.ex
defmodule Chowmonger.API.V1.TokenController do
  use Chowmonger.Web, :controller

  alias Chowmonger.API.V1.TokenView

  plug :scrub_params, "data" when action in [:create]

  def create(conn, %{"data" => %{"attributes" => token_params }}) do
    case Chowmonger.Token.authenticate(token_params) do
      {:ok, user} ->
        {:ok, jwt, _full_claims} = user |> Guardian.encode_and_sign(:token)
        user = Map.put_new(user, :jwt, jwt)

        conn
        |> put_status(:created)
        |> render("show.json", data: user)
      :error ->
        conn
        |> put_status(:unprocessable_entity)
        |> render("error.json")
    end
  end

  # called from Guardian.Plug.EnsureAuthenticated
  def unauthenticated(conn, params) do
    conn
    |> put_status(:forbidden)
    |> render(TokenView, "forbidden.json", error: "Not Authenticated")
  end

  def unauthorized(conn, params) do
    conn
    |> put_status(:forbidden)
    |> render(TokenView, "forbidden.json", error: "Not Authorized")
  end
end
~~~

We'll need to create a new helper module to help authenticate our session.
Comeonin gives us a handy checkpw/2 function so we can compare the user given
password with our hash stored in the database.

~~~elixir
#web/helpers/token.ex

defmodule Chowmonger.Token do
  alias Chowmonger.Repo
  alias Chowmonger.API.V1.User

  def authenticate(%{"email" => email, "password" => password}) do
    user = Repo.get_by(User, email: String.downcase(email))

    case check_password(user, password) do
      true -> {:ok, user}
      _    -> :error
    end
  end

  defp check_password(user, password) do
    case user do
      nil -> false
      _   -> Comeonin.Bcrypt.checkpw(password, user.password_hash)
    end
  end

end
~~~


We'll need a view for our Token.  We'll have three responses, one each
for success, invalid credentials, and forbidden access.  JaSerializer handles the
first while we'll handle the second two cases ourselves.

~~~elixir
#web/views/api/v1/token_view.ex

defmodule Chowmonger.API.V1.TokenView do
  use Chowmonger.Web, :view

  attributes [:id, :name, :email, :jwt]

  def render("error.json", _) do
    %{error: "Invalid email or password."}
  end

  def render("forbidden.json", %{error: error}) do
    %{error: error}
  end
end
~~~

We'll be leaving registration for homework. We'll just seed our
database with an admin user for this tutorial. Replace the contents of seeds.ex
with the following.

Note: This user has no special permissions, nor will it throughout the tutorial.
[Guardian](https://github.com/ueberauth/guardian) does have the ability to pass
permissions.

~~~elixir
#priv/repo/seeds.ex

alias Chowmonger.{Repo, User}

admin = %{ name: "Admin", email: "admin@chowmonger.com", password: "password" }
User.changeset(%User{}, admin) |> Repo.insert!
~~~

We should be able to migrate now.  You can use the alias ecto.setup defined in
mix.exs.  It will create, migrate, and seed the database.

~~~elixir
#web/controllers/api/v1/user_controller.ex

defmodule Chowmonger.API.V1.UserController do
  use Chowmonger.Web, :controller

  plug Guardian.Plug.EnsureAuthenticated, handler: Chowmonger.API.V1.TokenController

  def index(conn, _) do
    user = Guardian.Plug.current_resource(conn)
    render(conn, "index.json", data: user)
  end

  def show(conn, _) do
    case decode_and_verify_token(conn) do
      {:ok, _claims} ->
        user = Guardian.Plug.current_resource(conn)

        conn
        |> put_status(:ok)
        |> render("show.json", data: user)
      {:error, _reason} ->
        conn
        |> put_status(:not_found)
        |> render("errors.json", data: "Not found")
    end
  end

  defp decode_and_verify_token(conn) do
    conn
    |> Guardian.Plug.current_token
    |> Guardian.decode_and_verify
  end
end
~~~

We're only going to expose index & show to the API for now.  This way we can get the
currently logged in user. The user route would ideally be a singleton but EmberJS
doesn't support singleton REST calls.  So this will do for demo purposes.

Next let's add the Guardian serializer to lib.  This serializer is responsible
for fetching, encoding, and storing a resource into the JWT.

~~~elixir
#lib/chowmonger/guardian_serializer.ex

defmodule Chowmonger.GuardianSerializer do
  @behaviour Guardian.Serializer

  alias Chowmonger.API.V1.User
  alias Chowmonger.Repo

  def for_token(user = %User{}), do: {:ok, "User:#{user.id}"}
  def for_token(_), do: { :error, "Unknown resource type" }

  def from_token("User:" <> id) do
    {:ok, Repo.get(User, String.to_integer(id))}
  end

  def from_token(_), do: { :error, "Unknown resource type" }
end
~~~

And finally we can set up our router to post token.  We'll also need to add a
few plugs to our pipeline so that Guardian can process the JWT.

~~~elixir
#web/router.ex

pipeline :api do
  plug :accepts, ["json-api"]
  plug JaSerializer.ContentTypeNegotiation
  plug JaSerializer.Deserializer
  plug Guardian.Plug.VerifyHeader, realm: "Bearer"
  plug Guardian.Plug.LoadResource
end

scope "/api", Chowmonger do
  pipe_through :api

  scope "/v1", alias: API.V1 do
    resources "users", UserController, only: [:index, :show]
    post "token", TokenController, :create
  end
end
~~~

If everything went well we should be able to run our server and create a
token! Spin up the server and request a token. I use [Postman](https://www.getpostman.com/docs/),
but here's a cURL request for convenience.

~~~bash
mix phoenix.server

curl -X POST -H "Content-Type: application/vnd.api+json" -d '{
  "data": {
    "attributes": {
      "email": "admin@chowmonger.com",
      "password": "password"
    }
  }
}' "http://localhost:4000/api/v1/token"
~~~

Hopefully it worked! Here's what I got:

~~~json
{
  "jsonapi": {
    "version": "1.0"
  },
  "data": {
    "type": "token",
    "id": "1",
    "attributes": {
      "name": "Admin",
      "jwt": "eyJhbGciOiJIUzUxMiIsInR5cCI6IkpXVCJ9.eyJhdWQiOiJVc2VyOjEiLCJleHAiOjE0NjA0OTQ0MjQsImlhdCI6MTQ2MDIzNTIyNCwiaXNzIjoiVHJ1Y2tuIiwianRpIjoiMTE2NjJiYjgtODcwYS00MDU5LTg5ZDQtOTI1NjJkZjQ3MzJkIiwicGVtIjp7fSwic3ViIjoiVXNlcjoxIiwidHlwIjoidG9rZW4ifQ.q0b7xAYa04ADCzP2onK7UZqnsDLH4iE6dqntSJ3biogmKFrhu9JXa-QdmPzxzKGpp36tYbK3ujdLitSUPpkEGg",
      "email": "admin@chowmonger.com"
    }
  }
}
~~~

Lookin' good.  This isn't a complete solution for authentication, but it's a start.

Now that authentication is working, we can set up our Truck model. Since
we'll need a controller and a view in addition to the model, we should use
the provided json generator.

~~~bash
mix phoenix.gen.json API.V1.Truck trucks name:string lat:float lng:float \
    image:string user_id:references:user menu:array:string status:boolean \
    categories:array:string
~~~

We need to add a few things to the migration.  We'll set some null constraints
as well as a default image.

~~~elixir
defmodule Chowmonger.Repo.Migrations.CreateAPI.V1.Truck do
  use Ecto.Migration

  def change do
    create table(:trucks) do
      add :name, :string, null: false
      add :lat, :float, null: false
      add :lng, :float, null: false
      add :image, :string, default: "https://upload.wikimedia.org/wikipedia/commons/e/e3/Food_truck_in_London.jpg"
      add :menu, {:array, :string}
      add :status, :boolean, default: false
      add :categories, {:array, :string}
      add :user_id, references(:users, on_delete: :nothing)

      timestamps
    end
    create index(:trucks, [:user_id])

  end
end
~~~

Edit the Truck model as well to move image to an optional field and create a
relationship between Truck and User.

~~~elixir
#web/models/truck.ex

defmodule Chowmonger.API.V1.Truck do
  use Chowmonger.Web, :model

  schema "trucks" do
    field :name, :string
    field :lat, :float
    field :lng, :float
    field :image, :string
    field :menu, {:array, :string}
    field :status, :boolean, default: false
    field :categories, {:array, :string}
    belongs_to :user, Chowmonger.API.V1.User

    timestamps
  end

  @required_fields ~w(name lat lng categories)
  @optional_fields ~w(status menu image)

  @doc """
  Creates a changeset based on the `model` and `params`.

  If no params are provided, an invalid changeset is returned
  with no validation performed.
  """
  def changeset(model, params \\ :empty) do
    model
    |> cast(params, @required_fields, @optional_fields)
  end
end
~~~

We must add a has_one relationship to the User model as well.

~~~elixir
#web/models/user.ex

schema "users" do
  field :name, :string
  field :email, :string
  field :password, :string
  field :password_hash, :string
  has_one :truck, Chowmonger.API.V1.Truck

  timestamps
end
~~~

Open up the router and add our new trucks resource.

~~~elixir
#web/router.ex

scope "/api", Chowmonger do
  pipe_through :api

  scope "/v1", alias: API.V1 do
    resources "users", UserController, only: [:index, :show]
    resources "trucks", TruckController, only: [:index, :show, :update]
    post "token", TokenController, :create
  end
end
~~~

In the Truck Controller we need to do the following:
<ul>
 <li>- Add Guardian.Plug.EnsureAuthenticated plug</li>
 <li>- Change the scrub_params to "data" to match json-api standard</li>
 <li>- Change the update/2 params to match json-api standard</li>
 <li>- Remove all http verbs except show/2, index/2 and update/2</li>
</ul>

~~~elixir
#web/controllers/api/v1/truck_controller.ex
defmodule Chowmonger.API.V1.TruckController do
  use Chowmonger.Web, :controller

  alias Chowmonger.API.V1.Truck
  alias Chowmonger.Repo
  alias Guardian.Plug.EnsurePermissions

  plug EnsurePermissions, [handler: Chowmonger.API.V1.TokenController] when action in [:update]

  plug :scrub_params, "data" when action in [:update]

  def index(conn, _params) do
    trucks = Repo.all(Truck)
    render(conn, "index.json", data: trucks)
  end

  def show(conn, %{"id" => id}) do
    truck = Repo.get!(Truck, id)
    render(conn, "show.json", data: truck)
  end

  def update(conn, %{"data" => %{"attributes" => truck_params}, "id" => id}) do
    truck = Repo.get!(Truck, id)
    changeset = Truck.changeset(truck, truck_params)

    case Repo.update(changeset) do
      {:ok, truck} ->
        render(conn, "show.json", data: truck)
      {:error, changeset} ->
        conn
        |> put_status(:unprocessable_entity)
        |> render(Chowmonger.ChangesetView, "error.json", changeset: changeset)
    end
  end
end
~~~

Edit the Truck view to use ja_serializer

~~~elixir
#web/views/api/v1/truck_view.ex
defmodule Chowmonger.API.V1.TruckView do
  use Chowmonger.Web, :view

  attributes [:name, :lat, :lng, :image, :menu, :categories, :status]
end
~~~

Before we migrate let's change seeds.ex to add some trucks to the mix.

~~~elixir
#priv/repo/seeds.exs
alias Chowmonger.Repo
alias Chowmonger.API.V1.User

user = %{ name: "Admin", email: "admin@chowmonger.com", password: "password" }

truck = %{
           name: "Jim Bob's Shrimp Stand",
           lat: 41.8820989,
           lng: -87.6242104,
           image: "https://upload.wikimedia.org/wikipedia/commons/8/8d/Seattle_-_Maximus_Minimus_food_truck_03.jpg",
           menu: ["Shrimp Stew", "Shrimp Gumbo", "Shrimp Kabob"],
           categories: ["Creole", "Southern"],
           status: true
         }

truck2 = %{
            name: "Don't Nuts",
            lat: 41.8830989,
            lng: -87.6442104,
            image: "https://upload.wikimedia.org/wikipedia/commons/e/e5/Claire_et_Hugo_food_truck.JPG",
            menu: ["Crispy Nuts", "Salty Nuts", "Sweet Nuts", "Spicy Nuts", "Mixed Nuts"],
            categories: ["Nuts... what else?"],
            status: true
          }

truck3 = %{
            name: "Burgers and Peaches",
            lat: 41.8720989,
            lng: -87.6212104,
            image: "https://upload.wikimedia.org/wikipedia/commons/e/e3/Food_truck_in_London.jpg",
            categories: ["Beef", "Fruit"],
            menu: ["The Peachy Burger", "Poached Peaches a la mode"],
            status: true
          }

User.changeset(%User{}, user)
|> Repo.insert!
|> Ecto.build_assoc(:truck, truck)
|> Repo.insert!

Repo.one(User)
|> Ecto.build_assoc(:truck, truck2)
|> Repo.insert!

Repo.one(User)
|> Ecto.build_assoc(:truck, truck3)
|> Repo.insert!
~~~

Instead of migrating we should drop our database and set up a fresh one. Launch
the server so we can throw a request at it.

~~~bash
mix ecto.drop && mix ecto.setup
mix phoenix.server
curl -X GET -H "Content-Type: application/vnd.api+json" "http://localhost:4000/api/v1/trucks"
~~~

If we didn't forget a step you should get this back.

~~~javascript
{
  "jsonapi": {
    "version": "1.0"
  },
    "data": [
    {
      "type": "truck",
      "id": "1",
      "attributes": {
        "status": true,
        "name": "Jim Bob's Shrimp Stand",
        "menu": [
          "Shrimp Stew",
          "Shrimp Gumbo",
          "Shrimp Kabob"
        ],
        "lng": -87.6242104,
        "lat": 41.8820989,
        "image": "https://upload.wikimedia.org/wikipedia/commons/8/8d/Seattle_-_Maximus_Minimus_food_truck_03.jpg",
        "categories": [ "Creole", "Southern" ]
      }
    },
    {
      "type": "truck",
      "id": "2",
      "attributes": {
        "status": true,
        "name": "Don't Nuts",
        "menu": [
          "Crispy Nuts",
          "Salty Nuts",
          "Sweet Nuts",
          "Spicy Nuts",
          "Mixed Nuts"
        ],
        "lng": -87.6442104,
        "lat": 41.8830989,
        "image": "https://upload.wikimedia.org/wikipedia/commons/e/e5/Claire_et_Hugo_food_truck.JPG",
        "categories": [ "Nuts... what else?" ]
      }
    },
    {
      "type": "truck",
      "id": "3",
      "attributes": {
        "status": true,
        "name": "Burgers and Peaches",
        "menu": [ "The Peachy Burger", "Poached Peaches a la mode" ],
        "lng": -87.6212104,
        "lat": 41.8720989,
        "image": "https://upload.wikimedia.org/wikipedia/commons/e/e3/Food_truck_in_London.jpg",
        "categories": [ "Beef", "Fruit" ]
      }
    }
  ]
}
~~~

One of the main goals of this tutorial is to demonstrate Phoenix channels in
EmberJS.  Let's do that.

Generate a new channel for our trucks.

~~~bash
mix phoenix.gen.channel Truck trucks
~~~

Add our new channel to the user socket.

~~~elixir
#web/channels/user_socket.ex
channel "trucks", Chowmonger.API.V1.TruckChannel
~~~

Edit the new Truck channel.  Since we only need 'rooms' we can remove the :lobby
default in join/3.

~~~elixir
#web/channels/truck_channel.ex
def join("trucks", payload, socket) do
  if authorized?(payload) do
    {:ok, socket}
  else
    {:error, %{reason: "unauthorized"}}
  end
end
~~~

We can delete the handle_in functions since we are only broadcasting data out to
users.  We should be left with the module below.

~~~elixir
#web/channels/truck_channel.ex
defmodule Chowmonger.API.V1.TruckChannel do
  use Chowmonger.Web, :channel

  def join("trucks", payload, socket) do
    if authorized?(payload) do
      {:ok, socket}
    else
      {:error, %{reason: "unauthorized"}}
    end
  end

  # This is invoked every time a notification is being broadcast
  # to the client. The default implementation is just to push it
  # downstream but one could filter or change the event.
  def handle_out(event, payload, socket) do
    push socket, event, payload
    {:noreply, socket}
  end

  # Add authorization logic here as required.
  defp authorized?(_payload) do
    true
  end
end
~~~

Now we have a channel that our client can connect to.  The plan is to have a map
that updates when a Truck moves locations.  This way users always have the most
up to date information.

Since we want to notify the client when our Truck data changes, we can do this in
our Truck controllers update/2. Ember Data will make it easy for us to update
our Trucks using the store's findRecord method. We'll need respond with the id
of the truck that updates to use said method.

~~~elixir
#web/controllers/api/v1/truck_controller.ex
def update(conn, %{"data" => %{"attributes" => truck_params}, "id" => id}) do
  truck = Repo.get!(Truck, id)
  changeset = Truck.changeset(truck, truck_params)

  case Repo.update(changeset) do
    {:ok, truck} ->
      Chowmonger.Endpoint.broadcast_from! self(), "trucks", "change", %{"id" => id}
      render(conn, "show.json", data: truck)
    {:error, changeset} ->
      conn
      |> put_status(:unprocessable_entity)
      |> render(Chowmonger.ChangesetView, "error.json", changeset: changeset)
  end
end
~~~

We use broadcast_from to send the event "change" to all subscribers.  We'll be
watching this event in our client.

In order for our Ember client to connect to our API we'll have to enable
[CORS](https://developer.mozilla.org/en-US/docs/Web/HTTP/Access_control_CORS).
We can do that easily with [cors_plug](https://github.com/mschae/cors_plug). Add
it as a dependency and plug it into our endpoint just before the router.

~~~elixir
#mix.exs
defp deps do [{:phoenix, "~> 1.1.3"},
    {:phoenix_ecto, "~> 2.0"},
    {:postgrex, ">= 0.0.0"},
    {:phoenix_html, "~> 2.3"},
    {:phoenix_live_reload, "~> 1.0", only: :dev},
    {:gettext, "~> 0.9"},
    {:ja_serializer, "~> 0.8.0"},
    {:comeonin, "~> 2.1.0"},
    {:guardian, "~> 0.10.0"},
    {:cors_plug, "~> 1.1.1"},
    {:cowboy, "~> 1.0"}]
end

#lib/chowmonger/endpoint.ex
  ...

  plug CORSPlug
  plug Chowmonger.Router
end
~~~

Run mix deps.get per usual.

# EmberJS

Alright now we're ready to create our Ember app! Run the ember new generator and
then install a few libraries that we'll be using. For authentication we're using
ember-simple-auth. To have easy access to phoenix.js, a client side library to
Phoenix channels, we're using ember-phoenix.  We'll also need a sass compiler
since we'll be using that instead of vanilla css.

~~~bash
ember new truckn-ember
cd truckn-ember
ember install ember-simple-auth ember-phoenix ember-cli-sass
~~~

I'm using thoughtbot's bourbon and neat for some styling help so lets add that to
bower.json.

~~~javascript
//bower.json
{
  "name": "chowmonger-ember",
  "dependencies": {
    "ember": "~2.4.3",
    "ember-cli-shims": "0.1.1",
    "ember-cli-test-loader": "0.2.2",
    "ember-qunit-notifications": "0.1.0",
    "bourbon": "^4.2.6",
    "neat": "^1.7.4"
  }
}
~~~

We'll need to edit ember-cli-build.json to include bourbon and neat's stylesheets.

~~~javascript
//ember-cli-build.js
var app = new EmberApp(defaults, {
  sassOptions: {
    includePaths: [
      'bower_components/bourbon/app/assets/stylesheets',
      'bower_components/neat/app/assets/stylesheets'
    ]
  }
});
~~~

I won't be going over any styling in this tutorial.  You can use my
[stylesheets](TODO) to make the rest of this tutorial a bit more streamlined.
I'm no designer so I apologize if your eyes bleed.

ember-cli-sass looks for app.scss and right now we have app.css.  Go ahead and
rename that if you're **not** using my stylesheets.

~~~bash
mv app/styles/app.css app/styles/app.scss
~~~

At this point load up the server.

~~~bash
ember s
~~~

Open http://localhost:4200 in your browser.  You should see 'Welcome to Ember'.
You can change the port in .ember-cli if you wish.

For security we'll only allow ourselves and our API as sources for XHR and
WebSockets, we'll specify that in config/environment.js. You can read about CSP
[here](https://developer.mozilla.org/en-US/docs/Web/Security/CSP/CSP_policy_directives).

While editing environment.js, add some configuration for
ember-simple-auth.  We'll be creating our own authorizer to use JWT.  Then set
the auth routes since they default to index and map will serve as our root for
this tutorial.  I'm setting these ENV's in development since they'll likely be
different for production.

~~~javascript
//config/environment.js
ENV.contentSecurityPolicy = {
  'connect-src': ["'self'", "http://localhost:4000"]
},
ENV['simple-auth'] = {
  authorizer: 'authorizer:custom',
  crossOriginWhitelist: ['http://localhost:4000/'],
  authenticationRoute: 'map.panel.settings',
  routeAfterAuthentication: 'map.panel.settings',
  routeIfAlreadyAuthenticated: 'map.panel.settings'
}
~~~

Now to introduce the map.  The map will be the main focus of this application.
I initially went with google maps and had a good amount of success.  However I
recently discovered [Leaflet](http://www.leafletjs.com), a tiny open-source and
mobile-friendly library.  And to my surprise there exists a nifty Ember
addon for Leaflet: [ember-leaflet](http://www.ember-leaflet.com/).

We can go ahead and install ember-leaflet, and then generate a new route for our
map.

~~~bash
ember install ember-leaflet
ember g route map
~~~

Open the new map.hbs template and replace the contents with this:

~~~handlebars
<!--app/templates/map.hbs-->
{{#leaflet-map lat=lat lng=lng zoom=zoom dragging=true zoomControl=false}}
  {{tile-layer url="https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png"}}
{{/leaflet-map}}

{{outlet}}
~~~

The wonderful thing about ember-leaflet is that it truly adopts the Ember way by
making every aspect of the map a component whose attributes we can easily
change.  The above template assumes that we have lat, lng, and zoom as
properties in our map controller.  We don't have a controller for our map
route yet so let's create that.

~~~bash
ember g controller map
~~~

Controllers in Ember are on their way
[out](https://guides.emberjs.com/v2.5.0/controllers/).  However they're still
used to declare properties that don't belong to a model, at least until routable
components.  The lat, lng, and zoom properties will serve as defaults and will be
updated by geolocation and user input. I'm setting Chicago as the default.

~~~javascript
//app/controllers/map.js
import Ember from 'ember';

export default Ember.Controller.extend({
  lat: 41.881832,
  lng: -87.623177,
  zoom: 14
});
~~~

Go ahead and remove the Welcome to Ember message in application.hbs and pull up
http://localhost:4200/map.  If you're using my stylesheets you should see a map
spanning the entire browser window.

Now it's time to add our truck model.

~~~bash
ember g model truck name lat lng image menu categories status user
~~~

~~~javascript
//app/models/truck.js
import DS from 'ember-data';

export default DS.Model.extend({
  name: DS.attr(),
  lat: DS.attr(),
  lng: DS.attr(),
  image: DS.attr(),
  menu: DS.attr('array'),
  categories: DS.attr('array'),
  status: DS.attr()
});
~~~

The generated model doesn't import ember-data directly, but I find it a bit
cleaner to do so.  We'll be using a custom transform to handle the arrays
used for menu and categories.  I don't think this is the best solution, but it
works for this example.  Thanks to Samsinite for the handy transform.

~~~bash
ember g transform array
~~~

~~~javascript
//app/transforms/array.js

//https://gist.github.com/Samsinite/b775f3f0ce1a02a37424
import Ember from 'ember';
import DS from 'ember-data';

export default DS.Transform.extend({
  serialize(deserialized) {
    return !!deserialized ? deserialized.toArray() : null;
  },
  deserialize(serialized) {
    return Ember.A(serialized);
  }
});
~~~

By specifying a model in Ember we're laying out a schema for our Truck that
Ember expects to get from our API.  EmberJS uses the JSONAPIAdapter by default
which expects exactly the same format that our API is using (jsonapi.org).  The
beauty of standards!  We'll need to add an adapter so we can specify our
namespaced endpoint.

~~~bash
ember g adapter application
~~~

Edit to include the host and namespace of the API.

~~~javascript
//app/adapters/application.js
import JSONAPIAdapter from 'ember-data/adapters/json-api';

export default JSONAPIAdapter.extend({
  host: 'http://localhost:4000',
  namespace: 'api/v1',
});
~~~

With the adapter set up all we need to do now is specify the model we wish to
use in our map route.

~~~javascript
//app/routes/map.js
import Ember from 'ember';

export default Ember.Route.extend({
  model() {
    return this.store.findAll('truck');
  }
});
~~~

The code above says to set the model to the specified query.  In this case it is
querying for all trucks.  This is translated to a get request on
host/namespace/trucks.  If the request is successful the data returned is loaded
into the Ember data store and makes it available to our map route.

Ember has a set of handy dev
[tools](https://chrome.google.com/webstore/detail/ember-inspector/bmdblncegkenkacieihfhpjfppoconhi)
available for most browsers.  I highly recommend installing it!

Now that our data is accessible from the template we can start droppin pins.

~~~handlebars
<!--app/templates/map.hbs-->
{{#leaflet-map lat=lat lng=lng zoom=zoom dragging=true zoomControl=false}}
  {{tile-layer url="https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png"}}
  {{#each model as |truck|}}
    {{#marker-layer lat=truck.lat lng=truck.lng}}
      {{truck.name}}
    {{/marker-layer}}
  {{/each}}
{{/leaflet-map}}

{{outlet}}
~~~

You should now be able to see our first trucks on the map! The marker-layer
component yields to allow us to pass in the truck name.  Yeah, Ember is awesome.

Next we'll generate a few new routes. We'll be implementing a search feature as
well as a panel that will hold information about our trucks.  I'm taking huge
design hints from Google Maps (thanks!).

~~~bash
ember g route map/panel
ember g route map/panel/truck
~~~

Ember is really great for nested routes.  Our panel will sit on top of our map
and contain a search bar.  The truck route will display a selected truck's
information on the panel. Open the router.js file to make a modification to our
routes.

~~~javascript
#app/router.js
Router.map(function() {
  this.route('map', function() {
    this.route('panel', function() {
      this.route('truck', {path: '/:truck_id'});
    });
  });
});
~~~

Add fontawesome to our index.html if you're using my stylesheets.

~~~handlebars
<!--app/index.html-->
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <title>Chowmonger</title>
    <meta name="description" content="">
    <meta name="viewport" content="width=device-width, initial-scale=1">

    {{content-for "head"}}

    <link rel="stylesheet" href="assets/vendor.css">
    <link rel="stylesheet" href="assets/chowmonger-ember.css">
    <link rel="stylesheet" href="https://maxcdn.bootstrapcdn.com/font-awesome/4.6.1/css/font-awesome.min.css">

    {{content-for "head-footer"}}
  </head>
  <body>
    {{content-for "body"}}

    <script src="assets/vendor.js"></script>
    <script src="assets/chowmonger-ember.js"></script>

    {{content-for "body-footer"}}
  </body>
</html>
~~~

Next we'll edit our panel.hbs.

~~~handlebars
<!--app/templates/map/panel.hbs-->
<div class="panel">
  <div id="bars">
    <i class="fa fa-cog"></i>
  </div>
  <div id="search">
    {{input focus-in='focused' escape-press='clearName' value=name id="sb" placeholder="Feed me..."}}
  </div>
  <div class="search-icon-container">
    <i class="search-icon fa fa-times" {{action 'clearName'}}></i>
  </div>
  <div id="results-box">
    <div id="results">
      <ul>
        {{#each model as |t|}}
        <li>
          <div class="result-container">
            <i class="result-icon fa fa-heart-o"></i>
            <div class="result">{{t.name}}</div>
          </div>
        </li>
        {{/each}}
      </ul>
    </div>
  </div>
</div>

{{outlet}}
~~~

We create an input box that has a value of name.  We'll be using this value
to update query parameters and fetch results from our API.  This is a technique
I learned from
[Foraker](https://www.foraker.com/blog/creating-a-better-search-experience-with-ember).
Each time the query parameters change we will force the model to update.  This
will cause the results to only show trucks that match the query.  I think a
better implementation would work with model data already loaded into the store,
but I'm not sure how to do this yet.  Luckily Phoenix is fast and our data is
small so it's not a huge deal right now.

Let's add the logic to our search as well as a few actions. We'll need a
controller for our panel.

~~~bash
ember g controller panel
~~~

~~~javascript
//app/controllers/panel.js
import Ember from 'ember';

export default Ember.Controller.extend({
  queryParams: ['name'],
  name: "",
});
~~~

The queryParams mixin tells our controller to accept the name parameter and the
name property is what will hold our search string.  Next add the logic in the
panel route.

~~~javascript
//app/routes/map/panel.js
import Ember from 'ember';

export default Ember.Route.extend({
  queryParams: {
    name: {
      refreshModel: true,
      replace: true
    }
  },
  model(params) {
    if (params.name === "" || params.name === undefined) {
      return null;
    }
    else {
      return this.store.query('truck', { name: params.name });
    }
  },
  actions: {
    focused() {
      this.transitionTo('map.panel');
    },
    clearName() {
      var search = this.controllerFor('map.panel').get("name");

      if (search === "") {
        this.transitionTo('map');
      } else {
        this.controllerFor('map.panel').set("name", "");
        Ember.$('#sb').focus();
      }
    }
  }
});
~~~

The queryParams hash in the route allows us to configure 3 options.  Here we
set our model to refresh on any change in the name parameter and not to add
each change to the browser's history.  Both of these options default to false.
We specify our model to take the params and query our API, returning no results
if our parameter is empty or undefined.

We add two actions: focused() and clearName().  We add focused() to our input,
this will navigate to the panel route and give us a clear screen to search.
This doesn't seem necessary now, but it will when we add our truck information.
We also add clearName() to our input and the x icon.  This will clear the search
parameters as well as focus the input thus calling focused() and giving us a
clear screen.

If we click the x while the input is empty we transition back to
the map route.  This is a great way to free up some real estate on mobile. To
give the user a way to get back to search we should keep an icon on the page.

Edit our map template to add a search icon.

~~~handlebars
<!--map/templates/map.hbs-->
<div class="panel">
  <div class="search-icon-container">
    {{#link-to 'map.panel'}}
      <i class="search-icon fa fa-search"></i>
    {{/link-to}}
  </div>
</div>
~~~

If you test this search, you'll find that our API doesn't properly handle the
request. That should be obvious since we haven't edited our index action to
do so.  Let's do that now.

~~~elixir
#web/controllers/api/v1/truck_controller.ex
  ...

  def index(conn, params) do
    trucks =
      case params do
        %{"name" => name} ->
          Repo.all(from t in Truck, where: ilike(t.name, ^"%#{name}%"))
        _ ->
          Repo.all(Truck)
      end

    render(conn, "index.json", data: trucks)
  end
~~~

Replace our previous implementation with the index action with this.  Here we're
taking advantage of SQL ilike to do a simple case-insensitive pattern match on
our truck table. The '%' is interpreted by zero or more characters giving us the
ability to find results that match, even if our query is a substring.

Alright.  Back to Ember.  If everything went we'll you should be able to search
for a substring like so:

![search](search.png)

Open up our truck route.  We need to set the model.

~~~javascript
//app/routes/map/panel/truck.js
import Ember from 'ember';

export default Ember.Route.extend({
  model(params) {
    return this.store.findRecord('truck', params.truck_id);
  },
  actions: {
    focused() {
      this.transitionTo('map.panel');
    }
  },
  didInsertElement() {
    this.controllerFor('map.panel').set('name', "");
  }
});
~~~

We use the truck_id from the parameter specified in router.js to find our
record.  We also add a focused action here to handle it for this route.
didInsertElement is a hook provided by Ember that runs after the DOM has loaded.
We are using this to reset the params. Now let's add the template.

~~~handlebars
<!--app/templates/map/panel/truck.hbs-->
<div class="pane">
  <div class="truck-pane-image">
    <img src={{model.image}}>
  </div>
  <div class="truck-pane-title">
    <h1>{{model.name}}</h1>
  </div>
  <div class="truck-pane-info">
    <ul>
      <li><i class="fa fa-clock-o"></i>
      <span>
      {{#if model.status}}
        Open
      {{else}}
        Closed
      {{/if}}
      </span>
      </li>
      <li><i class="fa fa-cutlery"></i>
      <span>
        {{#each model.categories as |c index|}}
          {{if index ", "}}{{c}}
        {{/each}}
      </span>
      </li>
      <li><i class="fa fa-map-marker"></i>
      <span>{{model.address}}</span>
      </li>
    </ul>
  </div>
  {{#if model.menu}}
  <div class="truck-pane-menu-title">
    <h1>Menu</h1>
  </div>
  <div class="truck-pane-menu">
    {{#each model.menu as |m|}}
      <h1>{{m}}</h1>
    {{/each}}
  </div>
  {{/if}}
</div>
~~~

Most of this should be pretty self explanatory.  We're using a handy each with
index to separate our food categories by commas.  We'll be adding the address
later using reverse geocoding.

Right now we can't actually access this page from anywhere in our app so let's
fix that.

~~~handlebars
<!--app/templates/map.hbs-->
  {{#marker-layer lat=truck.lat lng=truck.lng
                  onClick=(action 'viewTruck' truck.id)}}
    {{truck.name}}
  {{/marker-layer}}
~~~

Add an onClick action to the marker-layer component.  Then add the action in the
map controller.

~~~javascript
//app/controllers/map.js
import Ember from 'ember';

export default Ember.Controller.extend({
  lat: 41.881832,
  lng: -87.623177,
  zoom: 14,
  actions: {
    viewTruck(id) {
      this.transitionToRoute('map.panel.truck', id);
    }
  }
});
~~~

And for the searches add a link-to in panel.hbs

~~~handlebars
<!--app/templates/map/panel.hbs-->

{{#link-to 'map.panel.truck' t.id (query-params name="")}}
  <div class="result">{{t.name}}</div>
{{/link-to}}
~~~

We're using the query-params helper to clear our parameters upon route change.
This prevents our search results from covering our panel.

Here's what it should look like if you click a marker or an item in the search
results box.

![truck](truckinfo.png)

Let's add the address attribute to our truck model. You'll need an API key for
this.  I'm using Google's reverse geocoding [service](https://developers.google.com/maps/documentation/geocoding/intro#reverse-example).

~~~javascript
import DS from 'ember-data';

export default DS.Model.extend({
  name: DS.attr(),
  lat: DS.attr(),
  lng: DS.attr(),
  image: DS.attr(),
  menu: DS.attr('array'),
  categories: DS.attr('array'),
  status: DS.attr(),
  address: null,

  addressChanged: Ember.on('init', Ember.observer('lat', 'lng', function() {
    let url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${this.get('lat')},${this.get('lng')}&key=YOUR_API_KEY`;
    var self = this;

    new Ember.RSVP.Promise(function(resolve, reject) {
      Ember.$.ajax(url, {
        success: function(response) {
          resolve(response.results[0].formatted_address);
        },
        error: function(reason) {
          reject(reason);
        }
      });
    }).then(function(response) {
      self.set('address', response);
    });

    return "calculating...";
  }))
});
~~~

We are using an observer to watch for any change in lat/lng and fetch a new
address from Google's API. The init bit is needed to fire the Observer upon
object initialization.  We return 'calculating...' to inform users that we are
in the process of getting the address.  This will change when the Promise
resolves.

![reverse geo](reversegeo.png)

Before we add our users we'll set up a settings route.  This is where our users
will login and logout and eventually change their preferences.

~~~bash
ember g route map/panel/settings
~~~

Add a template for our settings pane.

~~~handlebars
<!--app/templates/map/panel/settings.hbs-->
<div class="pane">
  <div class="settings-pane">
  </div>
</div>
{{outlet}}
~~~

Make the cog wheel transition to our settings pane.

~~~handlebars
<!--app/templates/map/panel.hbs-->
<div id="cog">
  {{#link-to 'map.panel.settings' (query-params name="")}}
    <i class="fa fa-cog"></i>
  {{/link-to}}
</div>
~~~

Current our settings page doesn't do anything.  Let's add a user login
component.

~~~bash
ember g component login-form
~~~

Add the new component to our settings template.

~~~handlebars
<!--app/templates/map/panel/settings.hbs-->
<div class="pane">
  <div class="settings-pane">
    {{login-form}}
  </div>
</div>
{{outlet}}
~~~

Edit the component template and add the form.  Eventually we'll be adding
sessions and we'll use isAuthenticated to determine if a user is signed in or
not.  The component below shows a login form if the user is not signed in and
their account name if they are.

~~~handlebars
<!--app/templates/components/login-form.hbs-->
{{#unless session.isAuthenticated}}
<div class="login">
<form {{action 'authenticate' on='submit'}}>
  {{input value=identification placeholder='Email'}}
  <span class="fa fa-envelope input-icon"></span>
  {{input value=password placeholder='Password' type='password'}}
  <span class="fa fa-key input-icon"></span>
  <button type="submit">Login
    <span class="fa fa-sign-out button-icon"></span>
  </button>
</form>
</div>
{{else}}
<div class="account">
  <i class="fa fa-user"></i>{{sessionAccount.currentUser.name}}
  <i class="fa fa-sign-out float-right" {{action 'invalidateSession'}}></i>
</div>
{{/unless}}
~~~

We'll leave this form incomplete for now while we implement authentication.
When we do we'll add our authenticate and invalidate session actions to
login-form.js.

Let's add users to our Ember app.  Generate a user model.

~~~bash
ember g model user name email truck
~~~

Import ember-data so we can use belongsTo.

~~~javascript
//app/models/user.js
import DS from 'ember-data';

export default DS.Model.extend({
  name: DS.attr('string'),
  email: DS.attr('string'),
  truck: DS.belongsTo('truck')
});
~~~

Now add the relation to the truck.  Our API defines the relation as one-to-one
so we want to do the same here.  In Ember there is no hasOne, instead you use
belongsTo for both models.

~~~javascript
//app/models/truck.js
import DS from 'ember-data';

export default DS.Model.extend({
  user: DS.belongsTo('user')
});
~~~

##Authentication

Ember simple auth uses authenticators to request permission to a server.  We'll
be using a custom authenticator to fetch a token from Guardian.  We'll extend
the base authenticator provided by the library.  Generate an authenticator named
guardian.

~~~bash
ember g authenticator guardian
~~~

Replace the contents with the code below.

~~~javascript
//app/authenticator/guardian.js
import Ember from 'ember';
import Base from 'ember-simple-auth/authenticators/base';

export default Base.extend({
  restore(data) {
    return new Ember.RSVP.Promise((resolve, reject) => {
      if (!Ember.isEmpty(data.token)) {
        resolve(data);
      } else {
        reject();
      }
    });
  },
  authenticate(options) {
    let session = {
      "data": {
        "attributes": {
          "email": options.identification,
          "password": options.password
        }
      }
    };

    return new Ember.RSVP.Promise((resolve, reject) => {
        Ember.$.ajax({
          url: 'http://localhost:4000/api/v1/token',
          headers: {
            accept: 'application/vnd.api+json'
          },
          contentType: 'application/vnd.api+json',
          crossDomain: true,
          type: 'POST',
          data: JSON.stringify(session)
        }).then(function(response) {
          Ember.run(function() {
            resolve({
              token: response.data.attributes.jwt,
              id: response.data.attributes.id
            });
          });
        }, function(xhr, status, error) {
          var response = xhr.responseText;
          Ember.run(function() {
            reject(response);
          });
        });
    });
  },
  invalidate() {
    return Ember.RSVP.resolve();
  }
});
~~~

restore() is triggered upon start of the application or if session data changes.
It will result in authentication if the session is still valid.

authenticate() will be called from the session using credentials from our form to
request a token from our API.  Upon success the token and user_id will be saved
in the session store.

invalidate() is called when our users log out. This will log this user out of
all sessions across browsers.

Next we'll create our session.  The session is an Ember service that serves as
the interface to the ESA library.  It provides access to the session data as well
as the authenticate, invalidate, and authorize methods.  We'll be extending the
default service to give us access to the current user.

~~~bash
ember g service session-account
~~~

~~~javascript
//app/services/session-account.js
import Ember from 'ember';

const { inject: { service  }, RSVP  } = Ember;

export default Ember.Service.extend({
  session: service('session'),
  store: service(),
  loadCurrentUser() {
    return new RSVP.Promise((resolve, reject) => {
      const user_id = this.get('session.data.authenticated.id');
      if(!Ember.isEmpty(user_id)) {
        return this.get('store').find('user', user_id).then((user) => {
          this.set('currentUser', user);
          resolve();
        }, reject);
      } else {
        resolve();
      }
    });
  }
});
~~~

Here we add the method loadCurrentUser().  This will fetch the current user using
the id stored from the authentication method.  We'll call this method from the
application route.

~~~bash
ember g route application
~~~

~~~javascript
//app/routes/application.js
import Ember from 'ember';
import ApplicationRouteMixin from 'ember-simple-auth/mixins/application-route-mixin';

const { service } = Ember.inject;

export default Ember.Route.extend(ApplicationRouteMixin, {
  sessionAccount: service('session-account'),

  beforeModel() {
    return this._loadCurrentUser();
  },
  sessionAuthenticated() {
    this._super(...arguments);
    this._loadCurrentUser().catch(() => this.get('session').invalidate());
  },
  _loadCurrentUser() {
    return this.get('sessionAccount').loadCurrentUser();
  }
});
~~~

In the application route we use ESA's application route mixin and cal our
loadCurrentUser() method in the beforeModel() hook.

Now we can generate our authorizer.  Ember simple auth uses authorizers to
inject our token into our server requests.

~~~bash
ember g authorizer custom
~~~

~~~javascript
//app/authorizer/custom.js
import Ember from 'ember';
import Base from 'ember-simple-auth/authorizers/base';

export default Base.extend({
  session: Ember.inject.service(),
  authorize(jqXHR, requestOptions) {
    var accessToken = this.get('session.data.authenticated.token');
    if (this.get('session.isAuthenticated') && !Ember.isEmpty(accessToken)) {
      requestOptions('Authorization', 'Bearer ' + accessToken);
    }
  }
});
~~~

We'll be using the DataAdapterMixin in our application adapter to attach our
authorizer header for every API request.  A great feature of this mixin is that
it will invalidate the session if a request produces a 401 (unauthorized).  Edit
the application adapter and add the mixin.

~~~javascript
//app/adapters/application.js
import JSONAPIAdapter from 'ember-data/adapters/json-api';
import DataAdapterMixin from 'ember-simple-auth/mixins/data-adapter-mixin';

export default JSONAPIAdapter.extend(DataAdapterMixin, {
  host: 'http://localhost:4000',
  namespace: 'api/v1',
  authorizer: 'authorizer:custom'
});
~~~

Excellent.  Now we need to add those login actions.  Open up login-form.js.

~~~javascript
//app/components/login-form.js
import Ember from 'ember';

export default Ember.Component.extend({
  session: Ember.inject.service('session'),
  sessionAccount: Ember.inject.service('session-account'),
  actions: {
    authenticate() {
      const credentials = this.getProperties('identification', 'password');
      this.get('session').authenticate('authenticator:guardian', credentials)
        .catch((reason) => {
          alert(reason);
        });
    },
    invalidateSession() {
      this.get('session').invalidate();
    }
  }
});
~~~

If you or I didn't forget anything you should be able to login!

Time for some socket action.

~~~bash
ember g service socket
~~~

~~~javascript
import Ember from 'ember';
import { Socket } from 'phoenix';

const { assert, Service, Evented } = Ember;

export default Service.extend(Evented, {
  socket: null,
  isHealthy: false,
  init() {
    this.on('open', () => {
      console.log('Socket was opened!');
    });
    this.on('close', () => {
      console.log('Socket was closed!');
    });
    this.on('error', () => {
      console.log('Socket encountered and error!');
    });

    this.connect();
  },
  connect() {
    const socket = new Socket("ws://localhost:4000/socket", {
      logger: ((kind, msg, data) => {
        console.log(`${kind}: ${msg}`, data);
      })
    });

    socket.connect();

    socket.onOpen(() => {
      this.set('isHealthy', true);
      this.trigger('open', ...arguments);
    });
    socket.onClose(() => {
      this.set('isHealthy', false);
      this.trigger('close', ...arguments);
    });
    socket.onError(() => {
      this.set('isHealthy', false);
      this.trigger('error', ...arguments);
    });

    this.set('socket', socket);
  },
  joinChannel(name) {
    const socket = this.get('socket');
    assert('must connect to a socket first', socket);

    const channel = socket.channel(name, {});
    channel.join();
    return channel;
  }
});
~~~

There's a lot going on here.  When our service is initialized we call our
connect method which creates a new socket connection using our API's socket
endpoint and the phoenix.js library. We then set up some events for logging
purposes.  Our joinChannel method will be called from our map route.

~~~javascript
//app/routes/map.js
import Ember from 'ember';

export default Ember.Route.extend({
  session: Ember.inject.service('session'),
  sessionAccount: Ember.inject.service('session-account'),
  store: Ember.inject.service(),
  socket: Ember.inject.service(),
  model() {
    return this.store.findAll('truck');
  },
  afterModel() {
    const chan = this.get('socket').joinChannel("trucks");

    chan.on("change", (payload) => {
      this.get('store').findRecord('truck', payload.id, {reload: true});
    });
  }
});
~~~

Here we're connection to our trucks channel in the afterModel() hook.  We then
set up an event handler for the change event, using the payload to reload the
updated truck's data. This ensures that any client connected to the channel will
always have the most up to date information about the trucks.

Open up your browser's javascript console and load the map route.  You should
get a 'Socket was opened!' log if the implementation is correct.  Now let's make
this connection useful.

Open the map template and add the ability to drag the trucks if authenticated.
We'll set draggable to true and add an action to update the truck's location on
the onDragend event.

~~~handlebars
<!--app/templates/map.hbs-->
{{#leaflet-map lat=lat lng=lng zoom=zoom dragging=true zoomControl=false}}
  {{tile-layer url="https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png"}}

  {{#each model as |truck|}}
    {{#if session.isAuthenticated}}
      {{#marker-layer lat=truck.lat lng=truck.lng draggable=true
        onClick=(action 'viewTruck' truck.id)
        onDragend=(action "updateLocation" truck)}}
        {{truck.name}}
      {{/marker-layer}}
    {{else}}
      {{#marker-layer lat=truck.lat lng=truck.lng
        onClick=(action 'viewTruck' truck.id)}}
        {{truck.name}}
      {{/marker-layer}}
    {{/if}}
  {{/each}}
{{/leaflet-map}}

<div class="panel">
  <div class="search-icon-container">
    {{#link-to 'map.panel'}}
      <i class="search-icon fa fa-search"></i>
    {{/link-to}}
  </div>
</div>
{{outlet}}
~~~

Add the updateLocation action to the map controller.  The second parameter is
provided by the marker-layer so that we can get the targeted markers lat and
lng.  We then set our truck model's new coordinates and save.  The save triggers
an patch to our API with the new data.  And since our channel broadcasts the id
of any truck that changes, all connected clients will immediately see the new
location.

~~~javascript
//app/controllers/map.js
import Ember from 'ember';

export default Ember.Controller.extend({
  session: Ember.inject.service('session'),
  sessionAccount: Ember.inject.service('session-account'),
  lat: 41.881832,
  lng: -87.623177,
  zoom: 14,
  actions: {
    viewTruck(id) {
      this.transitionToRoute('map.panel.truck', id);
    },
    updateLocation(truck, e) {
      let location = e.target.getLatLng();
      console.log(location);
      truck.set('lat', location.lat);
      truck.set('lng', location.lng);
      truck.save();
    }
  }
});
~~~

Now give it a try.  Login and drag a truck.  You should see the truck's new lat
and lng log to the console and update in your database.  Open up a different
browser to observe the magic of WebSockets!

This has great potential, but as it stands is very limited.  What we need to do
is only allow the logged in user to set the location of their own truck.  I'll
save that for another time along with registration, favorites, and possibly a
GenServer twitter crawler.  Stay tuned and thanks for reading.

Special thanks to all those who have already created Phoenix and EmberJS tutorials.
Without you and your wonderful posts, this would have been a much larger task.

# References
+ [JaSerializer](https://github.com/AgilionApps/ja_serializer)

+ [Comeonin](https://github.com/elixircnx/comeonin)

+ [Guardian](https://github.com/ueberauth/guardian)

+ [ember-simple-auth](https://github.com/simplabs/ember-simple-auth)

+ [Phoenix Framework](http://www.phoenixframework.org/)

+ [EmberJS](http://emberjs.com/)

+ [Leaflet](http://leafletjs.com/)

+ [Ember Leaflet](http://www.ember-leaflet.com/)
