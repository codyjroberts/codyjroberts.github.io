---
title: Hex Dependencies via Vimscript
date: 2016-09-30
category: til
---

I found myself, in (neo)vim as always, adding a library to `mix.exs`.
I wasn't sure of the current version of said package, so I reached
for a browser to check. I'm not sure why, but it felt so inefficient.

The first thing I did was check the `mix hex` command. Turns out
theres a `mix hex.info [pkg]` command that spits out some useful
information about a given hex package. One of the details returned
is the very handy configuration line for `mix.exs`.

Ding! I'll just use that!

~~~vim
function! GetHexPkgConfig(pkg)
  let @1 = system("mix hex.info " . a:pkg . " | grep 'Config:' | awk '{ print $2,$3,$4 }'")
  normal "1p==
endfunction

command! -nargs=1 HexC call GetHexPkgConfig("<args>")

nnoremap <Leader>hc :HexC
~~~

If you don't grok vimscript, no worries, I barely do. The above snippet
creates a `HexC` Ex command that takes an argument for the package name.
The command calls the defined function which snags the config line from
the `mix hex.info` command and pastes it into the buffer.

The real work comes from `grep` and `awk`. We use `grep` to snag the line that
contains 'Config:' and `awk` to pull out the columns that we need.

Magical.
