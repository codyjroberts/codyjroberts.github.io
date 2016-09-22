---
title: Railroady
date: 2015-09-04T16:23:58-05:00
category: til
---

[RailRoady](http://railroady.prestonlee.com/) is an incredibly awesome gem that spits out UML Diagrams for a 
Rails application.  It currently has support for ActiveRecord, Mongoid, and
Datamapper.  RailRoady relies on graphviz, you can install it via

~~~bash
$ sudo apt-get install graphviz 
~~~

Include it in your Gemfile

~~~bash
gem 'railroady' 
~~~

And then run the following...

~~~bash
$ rake diagram:all
~~~

Check the doc folder of your application to find svg's of
both your models and controllers. That's it!

I found this incredibly helpful when modeling a complex relational database.
I'm fairly new to relational databases, so a visualization really
helps tie everything together in my brain. I can definitely see myself using this
tool when jumping into a large open source Rails project that I'm unfamiliar
with.
