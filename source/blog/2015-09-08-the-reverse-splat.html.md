---
title: Ruby's Reverse Splat
date: 2015-09-08T12:08:50-05:00
category: til
---

Ruby's splat operator is one nifty little feature.  If you're not familiar, the
splat operator converts a variant number of arguments into an array like so...

~~~ruby
def get_args *args
  args
end

get_args('this', 'is', 'random')
=> ["this", "is", "random"]
~~~

The splat operator is super handy when the amount of arguments being passed is
unknown. What I learned today was that this operator can also be used when
passing an argument to a method. For a trivial example:

~~~ruby
def stringify_address city, state, zip
  "#{city}, #{state} #{zip}"
end

my_add = ['Chicago', 'IL', 60626]

stringify_address(*my_add)
=> "Chicago, IL 60626"
~~~
