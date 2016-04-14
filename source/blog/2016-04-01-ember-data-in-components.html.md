---
title: Ember Data & Components
date: 2016-04-01T07:00:00-00:00
category: article
---

I decided to build an EmberJS frontend to the Phoenix API i've been working on.
I have mostly avoided frontend frameworks purely due to the learning curve
and lack of time.  The independent study that I'm doing this semester allows me
a bit of freedom to learn what I think is important.  So for the last week and a
half I've been learning about EmberJS and I must say it's been challenging and
rewarding.

One roadblock I ran into was how to access an Ember Data model in my component.
From what I've read it seems that most of the time model data is used inside the
handlebars file of the component, like so:

~~~handlebars
<ul>
{{#each model as |truck|}}
  <li>{{truck.name}}</li>
{{/each}}
</ul>
~~~


This is pretty straightfoward.  The model is set in the route causing a get
request on http://ourserver.com/api/version/trucks as soon as the page loads.
The request retrieves all the entries and persists them to the store where we
can access them in our component from the variable model.  The route code is
shown here:

~~~javascript
import Ember from 'ember';

export default Ember.Route.extend({
  model() {
    return this.store.findAll('truck');
  }
});
~~~


This is great, but it wasn't what I needed.  My toy app needs to generate google
map markers for each entry in my model.  I'm handling all my google maps
generation in the javascript file inside my component.  After reading many blog
posts and coming up short, I searched the documenation for an answer.  I knew I
could access the store if I injected the service, but even when I did I could
figure out how to access each item.  I tried this first:

~~~javascript
import Ember from 'ember';

export default Ember.Component.extend({
  store: Ember.inject.service(),
  didInsertElement: () => {
    let trucks = this.get('store').findAll('truck');
  }
});
~~~


If you're new to Ember the code above may seems a bit weird.  On the fourth line
we are injecting the store service.  We don't actually have to send the name of
the service we wish to inject as a parameter as it looks for the name we set it
to, in this case store.  The fifth line is similar to $(document).ready but for
the component. This set trucks to what I believe is a promise.  From there I
couldn't really figure out how to access each item.  I'm still learning how
promises work, so I gave this a try.

~~~javascript
this.get('store').findAll('truck').then((trucks) => {
  console.log(trucks);
});
~~~

This didn't really work out for me either.  The object trucks gave me no clues
as to how to access the items.  I found the peekAll method in the documentation
which states that it returns a filtered array (RecordArray) immediately.  This
is different from findAll, which returns a promise.

~~~javascript
import Ember from 'ember';

export default Ember.Component.extend({
  store: Ember.inject.service(),
  didInsertElement: () => {
    //google maps code truncated
    var trucks = this.get('store').peekAll('truck');
    trucks.forEach((i) => {
      let t = {
        name: i.get('name'),
        menu: i.get('menu'),
        position: {
          lat: parseFloat(i.get('lat')),
          lng: parseFloat(i.get('lng'))
        },
        image: i.get('image')
      };
      this.addMarker(t);
    });
  },
  addMarker: function(truck){
    var menu = "";
    truck.menu.forEach((i) => {
      menu += `<li>${i}</li>`;
    });

    var infowindow = new google.maps.InfoWindow({
      content: `<h1>${truck.name}</h1><hr><ul>${menu}</ul>`
    });

    var marker = new google.maps.Marker({
      position: truck.position,
      map: bMap.gmap,
      icon: truck.image
    });

    marker.addListener('click', function(){
      infowindow.open(bMap.gmap, marker);
    });
  }
});
~~~

The code above is truncated for the sake of room. Finally I could use forEach to
iterate over my data and add as markers to my map.  Now I have no doubts that
this isn't the correct way to do this.  But until I find more information on the
subject it'll have to do.  I might have to subscribe to some Ember screencasts
in the near future.
