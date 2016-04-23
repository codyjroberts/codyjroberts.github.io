---
title: Phoenix & EmberJS - Part 1
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
</ul>
