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

The splat operator is super handy when the amount of parameters being passed is
unknown.  What I learned today was that this operator can also be used as a
parameter when you have an array that you wish to place as parameters to a
method call.  For example:

~~~ruby
def stringify_address city, state, zip
  puts "#{city}, #{state} #{zip}"
end

my_add = ['Chicago', 'IL', 60626]

stringify_address(*my_add)
=> "Chicago, IL 60626" 
~~~

I can't think of a use for this yet, but I'm sure one will pop up sometime in
the future.
