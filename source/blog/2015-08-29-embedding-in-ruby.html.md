---
title: Embedding C & Rust in Ruby
date: 2015-08-29T12:58:38-05:00
category: til
---

With the introduction of Fiddle into Ruby 1.9.x, it's pretty simple to embed
C(C++) and Rust into a Ruby program.  The following practically useless example
compiles both Rust and Cpp files into shared object files which can then be
imported by Fiddle for use in the Ruby file.


##Rust
create rust.rs

~~~c
//rust.rs
#[no_mangle] // prevent linker from mangling function names
pub extern "C" fn rust_calc(a: i32, b: i32) -> i32 {
  a + b
}
~~~

then compile...

~~~bash
$ rustc rust.rs --crate-type=dylib
~~~

Note: on some systems the shared object file will have extension .dylib

##C / C++
create calc.cpp

~~~c
//calc.cpp
extern "C" {
  int cpp_calc(int a, int b){
    return a + b;
  }
}
~~~

then compile...

~~~bash
$ g++ -c -fPIC -o calc.o calc.cpp
$ g++ -shared -o libcpp.so calc.o
~~~

##Ruby

There should now be both a librust.so and libcpp.so in your current directory.

create embed.rb

~~~ruby
#embed.rb

require 'fiddle'
require 'fiddle/import'

module EmbedRust
  extend Fiddle::Importer

  dlload './librust.so'

  extern "int rust_calc(int, int)"
end

module EmbedCpp
  extend Fiddle::Importer

  dlload './libcpp.so'

  extern "int cpp_calc(int, int)"
end

puts "Rust: #{EmbedRust.rust_calc(5, 5)}"
puts "Cpp: #{EmbedCpp.cpp_calc(5, 5)}"
~~~

That's it!  Obviously this example is trivial, and you gain next to nothing by
using Rust or C.  However if you need a performance increase, or have an
existing library it could be pretty handy.  Just be weary of exceptions!
