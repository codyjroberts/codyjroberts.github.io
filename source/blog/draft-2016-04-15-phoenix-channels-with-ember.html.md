---
title: Phoenix & EmberJS
date: 2016-04-15
category: article
---

For this tutorial I am using
Elixir v1.1.2
Phoenix v1.2.3

##Phoenix API

The first thing we'll do is initialize our Phoenix application.  We are skipping
brunch, an asset build tool, because we will be doing the front end separately 
with EmberJS.

~~~
mix phoenix.new truckn --no-brunch
cd truckn
~~~

Install the dependencies when prompted.

Since we'll be using the JSONAPI.org standard we can go ahead and add the
ja_serializer library to our dependencies.

~~~elixir
#mix.exs

defp deps do
  [{:phoenix, "~> 1.1.3"},
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

Lets configure Plug to accept our JSON-API MIME type.  And json-api to be
seralized with Poison.

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

scope "/api", Truckn do
  pipe_through :api

  scope "/v1" do

  end
end
~~~

Alright now that we have our api configured for JSONAPI.org standard lets set up
our models. We'll start with our users.  Lets add Guardian and Comeonin to our
dependencies, we'll use them for authentication and encryption.  We'll also need
to add :comeonin as an application (runtime) dependency.

~~~elixir
#mix.exs

def application do
  [mod: {Truckn, []},
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
  issuer: "Truckn",
  ttl: { 3, :days },
  verify_issuer: true,
  secret_key: to_string(Mix.env),
  permissions: %{
    default: [:read, :write]
  },
  serializer: Truckn.GuardianSerializer
~~~

Create our users using the handy json generator.

~~~bash
mix phoenix.gen.json User users name:string password:string password_hash:string
~~~

This will scaffold out our migration, model, controller, and json views.
Luxury. After it's done open up the create_users migration, we'll be adding a
few things.  We'll want to create a unique index for our emails (login) as well
as make our password virtual since we won't be storing it.

~~~elixir
defmodule Truckn.Repo.Migrations.CreateUser do
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

We'll also want to open up the User model and add some constraints and a
function to encrypt the virtual password. First we'll remove password_hash as a
required field.  Then we'll add the following constraints:

~~~elixir
def changeset(model, params \\ :empty) do
  model
  |> cast(params, @required_fields, @optional_fields)
  |> validate_format(:email, ~r/@/)
  |> validate_length(:password, min: 5)
  |> validate_confirmation(:password, message: "Incorrect password")
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

Let's clean up some of this generated mess.  We can delete our Page controller,
view, and template, and the associating tests.  We should move our new User
controller to controller/api/v1/. Next we'll create our Session controller.  The
Session controller will be handing out our JWTs.

~~~elixir
#web/controllers/api/v1/session_controller.ex

defmodule Truckn.SessionController do
  use Truckn.Web, :controller

  plug :scrub_params, "session" when action in [:create]

  def create(conn, %{"session" => session_params}) do
    case Truckn.Session.authenticate(session_params) do
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

  def unauthenticated(conn, _params) do
    conn
    |> put_status(:forbidden)
    |> render(Truckn.SessionView, "forbidden.json", error: "Not Authenticated")
  end
end
~~~

We'll need to create a new helper module to help authenticate our session.
Comeonin gives us a handy checkpw/2 function so we can compare the user given
password with our hash stored in the database.

~~~elixir
#web/helpers/session.ex

defmodule Truckn.Session do
  alias Truckn.{Repo, User}

  def authenticate(%{"email" => email, "password" => password}) do
    user = Repo.get_by(User, email: String.downcase(email))

    case check_password(user, password) do
      true -> {:ok, user}
      _ -> :error
    end
  end

  defp check_password(user, password) do
    case user do
      nil -> false
      _ -> Comeonin.Bcrypt.checkpw(password, user.password_hash)
    end
  end
end
~~~


We'll need a view for our Session.  We'll have three responses, one
for success, invalid credentials, and forbidden access. Notice that we include
a line for attributes.  This is for ja_serializer (TODO).

~~~elixir
#web/views/session_view.ex

defmodule Truckn.SessionView do
  use Truckn.Web, :view

  attributes [:name, :email, :jwt]

  def render("show.json", %{user: user}) do
    %{data: render_one(user, Truckn.SessionView, "user.json")}
  end

  def render("error.json", _) do
    %{error: "Invalid email or password"}
  end

  def render("forbidden.json", %{error: error}) do
    %{error: error}
  end

  def render("user.json", %{user: user}) do
    %{
      id: user.id,
      name: user.name,
      email: user.email,
      jwt: user.jwt
    }
  end
end
~~~

In order for us to use ja_serializer we'll have to use
JaSerializer.PhoenixView in our view.  Since we'll be using it for all of our
views we can just add it to web/web.ex.

~~~elixir
#web/web.ex

def view do
  quote do
    use Phoenix.View, root: "web/templates"
    use JaSerializer.PhoenixView

    ...
  end
end
~~~

For now our only user will be the Admin. Because of this we won't need most of
our User controller, so let's slim that down.  We could have just created these
files ourselves, it's down to preference.

~~~elixir
#web/controllers/api/v1/user_controller.ex

defmodule Truckn.UserController do
  use Truckn.Web, :controller

  alias Truckn.User

  plug Guardian.Plug.EnsureAuthenticated, handler: Truckn.SessionController

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
        |> render(Truckn.SessionView, "error.json", error: "Not found")
    end
  end

  defp decode_and_verify_token(conn) do
    conn
    |> Guardian.Plug.current_token
    |> Guardian.decode_and_verify
  end
end
~~~

We're only going to expose show to the API for now.  This way we can get the
currently logged in user.

Next let's add the Guardian serializer to lib.

~~~elixir
#lib/truckn/guardian_serializer.ex

defmodule Truckn.GuardianSerializer do
  @behaviour Guardian.Serializer

  alias Truckn.{Repo, User}

  def for_token(user = %User{}), do: {:ok, "User:#{user.id}"}
  def for_token(_), do: { :error, "Unknown resource type" }

  def from_token("User:" <> id) do
    {:ok, Repo.get(User, String.to_integer(id))}
  end

  def from_token(_), do: { :error, "Unknown resource type" }
end
~~~

And finally we can set up our router to post sessions and show users.  We'll
also need to add a few plugs to our pipeline.

~~~elixir
#web/router.ex

pipeline :api do
  plug :accepts, ["json-api"]
  plug JaSerializer.ContentTypeNegotiation
  plug JaSerializer.Deserializer
  plug Guardian.Plug.VerifyHeader, realm: "Bearer"
  plug Guardian.Plug.LoadResource
end

scope "/api", Truckn do
  pipe_through :api

  scope "/v1" do
    get "/users", UserController, :show

    post "/sessions", SessionController, :create
  end
end
~~~

Ok we're about ready to migrate, but before we do you may need to specifiy a
different postgresql template in config/dev.exs.  I'm on Ubuntu and the default
template isn't UTF8. If this is the case for you just specify template0.

~~~elixir
#config/dev.exs

# Configure your database
config :truckn, Truckn.Repo,
  adapter: Ecto.Adapters.Postgres,
  username: "postgres",
  password: "postgres",
  database: "truckn_dev",
  hostname: "localhost",
  template: "template0",
  pool_size: 10
~~~

Alright since we didn't add any way to register over the API we'll just seed our
database with an admin user. Replace the contents of seeds.ex with the
following.

~~~elixir
#priv/repo/seeds.ex

alias Truckn.{Repo, User}

admin = %{ name: "Admin", email: "admin@truckn.com", password: "password" }
User.changeset(%User{}, admin) |> Repo.insert!
~~~

We should be able to migrate now.  You can use the alias ecto.setup defined in
mix.exs.  It will create, migrate, and seed the database.

~~~bash
mix ecto.setup
~~~

If everything went well we should be able to run our server and create a
session! Spin up the server and request a token. I use Postman(TODO), but here's 
a curl request for convience.

~~~bash
mix phoenix.server

curl --request POST \
  --url 'http://localhost:4000/api/v1/sessions?session%5Bpassword%5D=password&session%5Bemail%5D=admin%40truckn.com' \
  --header 'accept: application/vnd.api+json' \
  --header 'content-type: application/vnd.api+json'
~~~

Hopefully it worked =). Here's what I got

~~~json
{
  "jsonapi": {
    "version": "1.0"
  },
  "data": {
    "type": "session",
    "id": "1",
    "attributes": {
      "name": "Admin",
      "jwt": "eyJhbGciOiJIUzUxMiIsInR5cCI6IkpXVCJ9.eyJhdWQiOiJVc2VyOjEiLCJleHAiOjE0NjA0OTQ0MjQsImlhdCI6MTQ2MDIzNTIyNCwiaXNzIjoiVHJ1Y2tuIiwianRpIjoiMTE2NjJiYjgtODcwYS00MDU5LTg5ZDQtOTI1NjJkZjQ3MzJkIiwicGVtIjp7fSwic3ViIjoiVXNlcjoxIiwidHlwIjoidG9rZW4ifQ.q0b7xAYa04ADCzP2onK7UZqnsDLH4iE6dqntSJ3biogmKFrhu9JXa-QdmPzxzKGpp36tYbK3ujdLitSUPpkEGg",
      "email": "admin@truckn.com"
    }
  }
}
~~~

Lookin' good. 

Now that our authentication is working, we can set up our Truck model. Since
we'll need a controller and a view in addition to the model, we should just use
the provided json generator.

~~~bash
mix phoenix.gen.json Truck trucks name:string lat:float lng:float image:string
user_id:references:user
~~~

We need to add a few things to the migration.  We'll set null
constraints on the name, lat, and lng columns as  well as provide a default
image.  I'm using an icon from [Nicolas Mollet](https://mapicons.mapsmarker.com).
Feel free to use whatever you wish.

~~~elixir
def change do
  create table(:trucks) do
    add :name, :string, null: false
    add :lat, :float, null: false
    add :lng, :float, null: false
    add :image, :string, default: "https://upload.wikimedia.org/wikipedia/commons/7/76/Map_marker_icon_%E2%80%93_Nicolas_Mollet_%E2%80%93_Cold_Food_Checkpoint_%E2%80%93_Sports_%E2%80%93_Gradient.png"
    add :user_id, references(:users, on_delete: :nothing)

    timestamps
  end
end
~~~

Edit the Truck model as well to move image to an optional field and create a
relationship between Truck and User.

~~~elixir
#web/models/truck.ex

schema "trucks" do
  field :name, :string
  field :lat, :float
  field :lng, :float
  field :image, :string
  belongs_to :user, Truckn.User

  timestamps
end

@required_fields ~w(name lat lng)
@optional_fields ~w(image)
~~~

We must add a has_one relationship to the User model as well.

~~~elixir
#web/models/user.ex

schema "users" do
  field :name, :string
  field :email, :string
  field :password, :string
  field :password_hash, :string
  has_one :truck, Truckn.Truck

  timestamps
end
~~~


Open up the router. Set the Truck route to depend on User.  Now's
a good time to fix the namespace to use scope/2.

~~~elixir
#web/router.ex

scope "/v1", alias: API.V1 do
  resources "/user", UserController, only: [:show], singleton: true do
  resources "/truck", TruckController, only: [:show, :update], singleton: true
  end

  post "/sessions", SessionController, :create
end
~~~

Now that we've used an alias on our scope we'll have to change our module names.
It's a bit of a pain but we're actually going to clean up our Truck controller
and views while were at it.

In the Truck Controller we need to do the following:
<ul>
 <li>- Add Guardian.Plug.EnsureAuthenticated plug</li>
 <li>- Change the scrub_params to "data" to match json-api standard</li>
 <li>- Change the update/2 params to match json-api standard</li>
 <li>- Remove all http verbs except show/2 and update/2</li>
 <li>- Change show/2 to ignore params since our route is a singleton</li>
 <li>- Use Guardian.Plug.current_resource/1 to get our authenticated User & Truck</li>
</ul>

~~~elixir
#web/controller/api/v1/truck_controller.ex
defmodule Truckn.API.V1.TruckController do
  use Truckn.Web, :controller

  alias Truckn.Truck

  plug Guardian.Plug.EnsureAuthenticated, handler: Truckn.API.V1.SessionController
  plug :scrub_params, "data" when action in [:update]

  def show(conn, _) do
    user = Guardian.Plug.current_resource(conn)
    truck = Repo.get_by!(Truck, user_id: user.id)
    render(conn, "show.json", data: truck)
  end

  def update(conn, %{"data" => %{"attributes" => truck_params}}) do
    user = Guardian.Plug.current_resource(conn)
    truck = Repo.get_by!(Truck, user_id: user.id)
    changeset = Truck.changeset(truck, truck_params)

    case Repo.update(changeset) do
      {:ok, truck} ->
        render(conn, "show.json", data: truck)
      {:error, changeset} ->
        conn
        |> put_status(:unprocessable_entity)
        |> render(Truckn.API.V1.ChangesetView, "error.json", changeset: changeset)
    end
  end
end
~~~

In the User controller rename the handler view and preload the truck model.
This will include the relationship in our use struct allowing us to use the
has_one macro provided by ja_serializer in our view.

~~~elixir
#web/controller/api/v1/user_controller.ex

plug Guardian.Plug.EnsureAuthenticated, handler: Truckn.API.V1.SessionController

def show(conn, _) do
  case decode_and_verify_token(conn) do
    {:ok, _claims} ->
      user = Guardian.Plug.current_resource(conn) |> Repo.preload(:truck)

      conn
      |> put_status(:ok)
      |> render("show.json", data: user)
    {:error, _reason} ->
      conn
      |> put_status(:not_found)
      |> render(Truckn.API.V1.SessionView, "error.json", error: "Not found")
  end
end
~~~


~~~elixir
#web/views/api/v1/user_view.ex
defmodule Truckn.API.V1.UserView do
  use Truckn.Web, :view
  
  attributes [:name, :email]

  has_one :truck,
    serializer: Truckn.API.V1.TruckView,
    include: true
end
~~~

~~~elixir
#web/views/api/v1/truck_view.ex
defmodule Truckn.API.V1.TruckView do
  use Truckn.Web, :view

  attributes [:name, :lat, :lng, :image]
end
~~~

~~~elixir
#web/views/api/v1/session_view.ex
defmodule Truckn.API.V1.SessionView do
  use Truckn.Web, :view

  attributes [:name, :email, :jwt]

  def render("error.json", _) do
    %{error: "Invalid email or password."}
  end

  def render("forbidden.json", %{error: error}) do
    %{error: error}
  end
end
~~~

I moved the views into /api/v1.  You'll also need to change any references to
these these new module names. Before we migrate let's change seeds.ex to add a
Truck to the mix.

~~~elixir
alias Truckn.{Repo, User}

user = %{ name: "Admin", email: "admin@truckn.com", password: "password" }
truck = %{ name: "Jim Bob's Shrimp Stand", lat: 41.8820989, lng: -87.6242104}

User.changeset(%User{}, user)
|> Repo.insert!
|> Ecto.build_assoc(:truck, truck)
|> Repo.insert!
~~~

Alright that was a lot of changes.  Instead of migrating we should drop our database
and set up a fresh one. Launch the server so we can throw a request at it.

~~~bash
mix ecto.drop && mix ecto.setup
mix phoenix.server

curl --request GET \
       --url http://localhost:4000/api/v1/user \
       --header 'accept: application/vnd.api+json' \
       --header 'authorization: Bearer
       eyJhbGciOiJIUzUxMiIsInR5cCI6IkpXVCJ9.eyJhdWQiOiJVc2VyOjEiLCJleHAiOjE0NjEyMDA5MjIsImlhdCI6MTQ2MDk0MTcyMiwiaXNzIjoiVHJ1Y2tuIiwianRpIjoiODJlZGQxOWQtMTEyZi00MzU0LThiYjUtOTI5MjMzY2NlNjE5IiwicGVtIjp7fSwic3ViIjoiVXNlcjoxIiwidHlwIjoidG9rZW4ifQ.6goLJcUWjj0qMY9XyzXXwiKu_bZ9gOsYPXEXNer8xKddoPSjqUsRIKATU31AfZCenDGPDr7Sw2G62ZoknyQ8xg' \
         --header 'cache-control: no-cache' \
         --header 'content-type: application/vnd.api+json' \
         --header 'postman-token: 4cff9585-fd45-a37a-c967-bd57953ab9bc'
~~~

If we didn't forget a step you should get this back.

~~~javascript
{
  "jsonapi": {
    "version": "1.0"
  },
    "included": [
    {
      "type": "truck",
      "id": "1",
      "attributes": {
        "name": "Jim Bob's Shrimp Stand",
        "lng": -87.6242104,
        "lat": 41.8820989,
        "image": "https://upload.wikimedia.org/wikipedia/commons/7/76/Map_marker_icon_%E2%80%93_Nicolas_Mollet_%E2%80%93_Cold_Food_Checkpoint_%E2%80%93_Sports_%E2%80%93_Gradient.png"
      }
    }
  ],
    "data": {
      "type": "user",
      "relationships": {
        "truck": {
          "data": {
            "type": "truck",
            "id": "1"
          }
        }
      },
      "id": "1",
      "attributes": {
        "name": "Admin",
        "email": "admin@truckn.com"
      }
    }
}
~~~

That does it for part 1.  Check out part 2 to see how we build our EmberJS app
to support our Phoenix API and use channels to update Google map markers.

##EmberJS

Generate a new channel for our trucks.

~~~bash
mix phoenix.gen.channel Truck trucks
~~~

Add our new channel to the user socket.

~~~elixir
#web/channels/user_socket.ex
channel "trucks", Truckn.TruckChannel
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
defmodule Truckn.TruckChannel do
  use Truckn.Web, :channel

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
that updates via the socket connection when a food Truck moves locations.  This
way users always have the most up to date information.  In the future we could
use this to update a menu when a certain item sells out.

Since we want to broadcast changes upon 'update' we can do this in our Truck
controllers update/2. EmberJS models can update asyncronously with the store's
findAll method. We probably don't need to send information over the channel, but
for simplicity we'll be sending the location details. The name will update
automatically via findAll.

~~~elixir
#web/controllers/api/v1/truck_controller.ex
case Repo.update(changeset) do
  {:ok, truck} ->
    payload = %{
      "lat" => truck.lat,
      "lng" => truck.lng
    }
    Truckn.Endpoint.broadcast_from! self(), "trucks", "change", payload
    render(conn, "show.json", data: truck)
  {:error, changeset} ->
    conn
    |> put_status(:unprocessable_entity)
    |> render(Truckn.API.V1.ChangesetView, "error.json", changeset: changeset)
end
~~~

We're almost ready to start the client side.  But before we do we have to make a
new route for our Trucks.  Check out our current available routes.

~~~bash
mix phoenix.routes

      user_path  GET    /api/v1/user        Truckn.API.V1.UserController :show
user_truck_path  GET    /api/v1/user/truck  Truckn.API.V1.TruckController :show
user_truck_path  PATCH  /api/v1/user/truck  Truckn.API.V1.TruckController :update
                 PUT    /api/v1/user/truck  Truckn.API.V1.TruckController :update
   session_path  POST   /api/v1/sessions    Truckn.API.V1.SessionController :create
~~~

You probably notice that since we used singletons we have no way of returning
all trucks.  We need this ability!  Our Ember app will call this route each
time a truck updates. Create a new TruckListing controller and view, and add the
following.

~~~elixir
#web/controllers/api/v1/truck_listing_controller.ex
defmodule Truckn.API.V1.TruckListingController do
  use Truckn.Web, :controller

  def index(conn, _params) do
    trucks = Repo.all(Truckn.Truck)
    render(conn, "index.json", data: trucks)
  end
end

#web/views/api/v1/truck_listing_controller.ex
defmodule Truckn.API.V1.TruckListingView do
  use Truckn.Web, :view

  attributes [:name, :lat, :lng, :image]

  def type, do: "truck"
end
~~~

That's it! You can test the new route, you should get back something similar to
this:

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
        "name": "Joe Bob's Shrimp Stand",
        "lng": -87.6242104,
        "lat": 41.8820989,
        "image": "https://upload.wikimedia.org/wikipedia/commons/7/76/Map_marker_icon_%E2%80%93_Nicolas_Mollet_%E2%80%93_Cold_Food_Checkpoint_%E2%80%93_Sports_%E2%80%93_Gradient.png"
      }
    }
  ]
}
~~~

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

#lib/truckn/endpoint.ex
  ...

  plug CORSPlug
  plug Truckn.Router
end
~~~

Run mix deps.get per usual.

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
  "name": "truckn-ember",
  "dependencies": {
    "ember": "~2.4.3",
    "ember-cli-shims": "0.1.1",
    "ember-cli-test-loader": "0.2.2",
    "ember-qunit-notifications": "0.1.0",
    "bourbon": "^4,2,6",
    "neat": "^1.7.4"
  }
}
~~~

We'll need to edit ember-cli-build.json to include bourbon and neat's paths.

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

ember-cli-sass looks for app.scss and right now we have app.css.  Go ahead and
rename that.

~~~bash
mv app/styles/app.css app/styles/app.scss
~~~

At this point load up the server.

~~~bash
ember s
~~~

I won't be going over any styling in this tutorial.  You can use my [TODO]() to
make the rest of this tutorial a bit more streamlined.  I'm no designer so I
apologize if your eyes bleed.

Open http://localhost:4200 in your browser.  You should see 'Welcome to Ember'.
You can change the port in .ember-cli if you wish.

Since the client will be  using WebSockets to request data from the API, we'll
specify that as a source in config/environment.js. You can read about CSP
[here](https://developer.mozilla.org/en-US/docs/Web/Security/CSP/CSP_policy_directives).

While editing environment.js, add some configuration for
ember-simple-auth.  We'll be creating our own authorizer to use JWT.

~~~javascript
//config/environment.js
ENV.contentSecurityPolicy = {
  'connect-src': "'self': http://localhost:4000"
},
ENV['simple-auth'] = {
  authorizer: 'authorizer:jwt',
  routeAfterAuthentication: 'map',
  routeIfAlreadyAuthenticated: 'map'
}
~~~

Now to introduce the map.  The map will be the main focus of this application.
I initially went with google maps and had a good amount of success.  However, I
recently discovered [Leaflet](http://www.leafletjs.com), a tiny open-source and
mobile-friendly library.  And to my surprise there exists a nifty Ember
addon for Leaflet: [ember-leaflet](http://www.ember-leaflet.com/).

We can go ahead and install ember-leaflet, and then generate a new route for our
map.

~~~bash
ember install ember-leaflet
ember g route map
~~~

Open the new map.hbs template and replace with this:

~~~handlebars
<!--app/templates/map.hbs-->
{{#leaflet-map lat=lat lng=lng zoom=zoom dragging=true}}
  {{tile-layer url="http://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png"}}
{{/leaflet-map}}
~~~

The wonderful thing about ember-leaflet is that it truly adopts the Ember way by
making every aspect of the map a component whose attributes we can easily
change.  The above template assumes that we have lat, lng, and zoom as
properties in our map controller.  We don't even have a controller for our map
route yet so let's create that.

~~~bash
ember g controller map
~~~

Controllers in Ember are on their way
[out](https://guides.emberjs.com/v2.5.0/controllers/).  However they're still
used to declare properties that don't belong to a model.  The lat, lng, and zoom
properties will serve as defaults and will be updated by geolocation and user
input. I'm setting Chicago as the default.

~~~javascript
//app/controllers/map.js
import Ember from 'ember';

export default Ember.Controller.extend({
  lat: 41.881832,
  lng: -87.623177,
  zoom: 14
});
~~~

Now it's time to add our truck model.

~~~bash
ember g model truck name lat lng image
~~~

By specifying a model in Ember we're laying out a schema for our Truck that our
app expects to get from our API.  EmberJS uses the JSONAPI adapter by default
which expects exactly the same format our API is using.  The beauty of
standards!  We'll need to add an adapter so we can specify our namespaced
endpoint.

~~~bash
ember g adapter application
~~~

Edit to include the host and namespace of the API.

~~~javascript
//app/adapters/application.js
import JSONAPIAdapter from 'ember-data/adapters/json-api';

export default JSONAPIAdapter.extend({
  host: 'http://localhost:4000',
  namespace: 'api/v1'
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
  {{tile-layer url="http://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png"}}

  {{#each model as |truck|}}
    {{marker-layer lat=truck.lat lng=truck.lng}}
  {{/each}}
{{/leaflet-map}}

{{outlet}}
~~~

You should now be able to see our first truck on the map!

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
  this.route('map', {path: '/'}, function() {
    this.route('panel', {path: 'panel'}, function () {
      this.route('truck', {path: '/:truck_id'});
    });
  });
});
~~~

We are making the map route to the index, I'm doing this because I want the map to
always be displayed.  From the map we'll nest our panel and then our truck.
It'll make more sense as we progress.  Next we'll edit our panel.hbs.

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

Here we create an input box that has a value of name.  We'll be using this value
to update query parameters and fetch results from our API.  This is a technique
I learned from
[Foraker](https://www.foraker.com/blog/creating-a-better-search-experience-with-ember).
Each time the query parameters change we will force the model to update.  This
will cause the results to only show trucks that match the query.  I think a
better implementation would work with model data already loaded into the store,
but I'm not sure how to do this yet.  Luckily Phoenix is so fast and our data is
small it's not a huge deal.

Let's add the logic to our search. We'll need a controller for our panel.

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
    if (params.name === "" || params.name === undefined)
      return null;
    else
      return this.store.query('truck', { name: params.name });
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
        $('#sb').focus();
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

If you test this search, you'll find that our API can't handle the request.
That should be obvious since we haven't added a route and accompanied action to
do so.  Let's do that now.

~~~elixir
#web/controllers/api/v1/truck_listing_controller.ex
  ...

  alias Truckn.Truck

  def index(conn, params) do
    case params do
      %{"name" => name} ->
        trucks = Repo.all(from t in Truck, where: ilike(t.name, ^"%#{name}%"))
      _ ->
        trucks = Repo.all(Truck)
    end

    render(conn, "index.json", data: trucks)
  end
~~~

Replace our previous implementation with the index action with this.  Here we're
taking advantage of SQL ilike to do a simple case-insensitive pattern match on
our truck table. The '%' is interpreted by zero or more characters giving us the
ability to find results that match, even if our query is a substring.

While were here let's add a new show action that we'll need for our truck route.
After that change our router.ex to include this new route.

~~~elixir
#web/controllers/api/v1/truck+listing_controller.ex
  ...

  def show(conn, %{"id" => truck_id}) do
    truck = Repo.one(from t in Truck, where: t.id == ^truck_id)
    render(conn, "show.json", data: truck)
  end

#web/router.ex
  ...

  resources "trucks", TruckListingController, only: [:index, :show]

  ...
~~~

That should give us access to information about an individual truck via
api/v1/trucks/:id

Alright.  Back to Ember.  We need to set our route's model.

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
  }
});
~~~

We use the truck_id from the parameter specified in router.js to find our
record.  We also add a focused action here to handle it for this route.  Now
let's add the template.

~~~handlebars
<!--app/templates/map/panel/truck.hbs-->
<div class="truck-pane">
  <div class="truck-pane-image">
    <img src={{model.image}}>
  </div>
  <div class="truck-pane-title">
    <h1>{{model.name}}</h1>
  </div>
  <div class="truck-pane-info">
    <ul>
      <li><i class="fa fa-clock-o"></i>
      <span>30 minutes</span>
      </li>
      <li><i class="fa fa-cutlery"></i>
      <span>Coffee, Crepes, Donuts</span>
      </li>
      <li><i class="fa fa-map-marker"></i>
      <span>123 N. LaSalle St.</span>
      </li>
    </ul>
  </div>
  <div class="truck-pane-menu-title">
    <h1>Menu</h1>
  </div>
  <div class="truck-pane-menu">
    <h1>Hot Dog..............$1</h1>
    <h1>Hot Dog..............$1</h1>
    <h1>Hot Dog..............$1</h1>
    <h1>Hot Dog..............$1</h1>
    <h1>Hot Dog..............$1</h1>
    <h1>Hot Dog..............$1</h1>
  </div>
</div>
~~~

I used some boilerplate above to show how our panel will look.  We can use
actual data later when we have it.  Right now we can't actually get to this
template.  We can search for trucks but can't click them, and our markers show
no information.

Edit our map controller to add an action for our markers.

~~~javascript
//app/controllers/map.js
  ...
  actions: {
    viewTruck(id) {
      this.transitionToRoute('map.panel.truck', id);
    }
  }
  ...
~~~

Now edit the marker-layer component to include the action passing in the truck's
id.

~~~handlebars
<!--app/templates/map.hbs-->

  {{#each model as |truck|}}
    {{marker-layer lat=truck.lat lng=truck.lng onClick=(action 'viewTruck' truck.id)}}
  {{/each}}

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

Before we add our users we'll set up a settings route.  This is where our users
will login and logout and eventually change their preferences.

~~~bash
ember g route map/panel/settings
~~~

Next we'll add users to our Ember app.  Generate a user model

~~~bash
ember g model user name email truck
~~~

Import belongsTo so we can create a relation with our truck model.

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
  name: DS.attr(),
  lat: DS.attr(),
  lng: DS.attr(),
  image: DS.attr(),
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
      "session": {
        "email": options.identification,
       "password": options.password
      }
    };

    return new Ember.RSVP.Promise((resolve, reject) => {
      Ember.$.ajax({
        url: 'http://localhost:4000/api/v1/sessions',
        headers: {
          accept: 'application/vnd.api+json'
        },
        contentType: 'application/vnd.api+json',
        crossDomain: true,
        type: 'POST',
        data: JSON.stringify(session)
      }).then((response) => {

        Ember.run(() => {
          resolve({ token: response.data.attributes.jwt });
        });

      }, function(xhr) {

        var response = xhr.responseText;
        Ember.run(() => { reject(response); });

      });
    });
  }
});
~~~

Restore is triggered upon start of the application or if session data changes.
It will result in authentication if the session is still valid.

Authenticate will be called from the session using credentials from our form to
request a token from our API.  Upon success the token will saved in the session
store.

Next we'll create our session.  The session is an Ember service that serves as
the interface for library.  It provides access to the session data as well as
the authenticate, invalidate, and authorize methods.  We'll be extending the
default service to give us access to the current user.

~~~bash
ember g service session
~~~

~~~javascript
//app/services/session.js
import ESASession from "ember-simple-auth/services/session";
import Ember from 'ember';

export default ESASession.extend({
  store: Ember.inject.service(),
  setCurrentUser: function() {
    if (this.get('isAuthenticated')) {
      this.get('store').queryRecord('user', {}).then((user) => {
        this.set('currentUser', user);
      });
    }
  }.observes('isAuthenticated')
});
~~~

Here we add the method setCurrentUser, and attach the observes function causing
it to execute on change to the isAuthenticated property.  If our user is
authenticated then we'll query our API for the user and set it as the property
currentUser.

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

References
----------
<ul>
 <li>
 - https://github.com/AgilionApps/ja_serializer
 </li>
 <li>
 - https://github.com/elixircnx/comeonin
 </li>
 <li>
 - https://github.com/ueberauth/guardian
 </li>
 <li>
 - https://github.com/levanto-financial/ember-phoenix
 </li>
 <li>
 - https://github.com/aexmachina/ember-cli-sass
 </li>
 <li>
 - https://github.com/simplabs/ember-simple-auth
 </li>

</ul>
