---
title: A Tour of Phoenix
date: "2016-01-30 12:00:00 -0600"
category: article
---

Working with Rails has been wonderful: there are many tutorials
and resources to choose from, ruby is a wonderful language, there are an
extensive ammount of third party libraries (gems), and the framework just makes sense. That being said I found it quite easy to build apps without truly understanding what's beneath the surface. This is not a fault of Rails so much as it is a fault of the age of its codebase and my inexperience with web frameworks. With over 50k commits, Rails has been written and rewritten by more than 2000 contributors. Like any large codebase it can take awhile to get a feel for how it all comes together.

This is one of the reasons I'm so excited to be working with Phoenix at such an
early stage in it's development. The framework itself is pretty small in
comparison. While not the best metric to compare the projects, the latest version
of Rails is 6.4MB compared to Phoenix at 329KB. Phoenix, like Rails, is also
very modular. But I feel that being functional makes it much easier to see
how the pieces fit together. There aren't as many resources given Phoenix's
early age, but you'll find many questions answered fairly quickly by
José Valim, Chris McCord, and other eminent members of the community.

I've started working through Programming Phoenix by Chris McCord, Bruce Tate,
and José Valim. The book is currently available in Beta from Pragmatic Press.
The authors have done a great job at both introducing the framework and
explaining how it works. In this post I'm going to run through the structure of
a Phoenix application from the endpoint to the controller.

##Phoenix.Endpoint

The endpoint, as described by the docs, is the boundary between the web server
and the Phoenix application. As the boundary, the endpoint also plays the role
as a child in your OTP applications supervisor tree. This means that upon failure,
it is the endpoint that is restarted. The endpoint is responsible for handling
requests and piping them through a series of plugs. Each plug is a composable
module that handles a specific part of the transaction between the request and
the application. The endpoint is also home to some web specific configuration
for your application.

##Phoenix.Router

As a request pipes through the plugs in the endpoint it always concludes with the
Router. The router is made up of the browser and api pipelines. Each of these
pipelines also consist of a series of plugs that handle each request for that
particular type of response. The default browser pipeline only accepts html requests
and handles security and sessions. The default api pipeline accepts only JSON.
The important thing to remember here is that each of these plugs are independent
and can be modified or swapped at the developers discretion. If you wanted to
handle some other filetype request you could simply write a plug for it and pop
it into your newly defined pipeline.

The router uses these pipelines inside of the scope macro.  The scope here is
what you would expect, a namespace for your application. A typical application
may scope the root at "/" and pipe through the browser, then scope an underlying
api under some versioned namespace such as "/api/v1/" and pipe it through the api
pipeline.

Inside of the scope is where you place a series of macros corresponding to the
RESTful verbs. Each of these macros start with the verb followed by a path and
corresponding controller. Like Rails, Phoenix also provides a resources macro to
easily group all of the RESTful actions together with options to omit one or
more.

##Phoenix.Controller

Controllers house the functions that define each of the RESTful routes given
inside the Router, often grouped by a particular model. Each function takes the
Plug.Conn struct, the one that has been passed down from that first boundary
connection in the Endpoint through all of the pipelines, and the url parameters
as arguments. Then the function typically uses some control flow and render/3 to
render a template and set the right MIME content-type response.

##Conclusion

As you can probably tell, Phoenix is structured very similarly to Rails. The
main difference that I see is the use of the Plug library. Plugs make it easy to
trace a request from beginning to end. The more I tinker with Elixir and Phoenix
the more I appreciate the functional paradigm and feel that it just makes sense
for composing web applications.
