---
title: Phoenix & EmberJS - Part 2
date: 2016-04-15
category: article
---

For this tutorial I am using
Elixir v1.1.2
Phoenix v1.2.3

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
import Model from 'ember-data/model';
import attr from 'ember-data/attr';
import belongsTo from 'ember-data/belongsTo';

export default Model.extend({
  name: attr('string'),
  email: attr('string'),
  truck: belongsTo('truck')
});
~~~

#Resources
https://github.com/levanto-financial/ember-phoenix
https://github.com/aexmachina/ember-cli-sass
https://github.com/simplabs/ember-simple-auth
