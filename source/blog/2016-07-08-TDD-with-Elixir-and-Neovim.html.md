---
title: TDD with Elixir and Neovim
date: 2016-07-08
category: til
---

I had pretty good mileage with [mix-test.watch](https://github.com/lpil/mix-test.watch), but recently it hasn't been working for me. There also seems to be some issues using it with Phoenix. I searched for another test runner but couldn't seem to find one.

In an effort to make use of Neovim's terminal editor and solve my testing problem, I decided to ditch my typical tmux workflow. I wrote up a simple vim binding to run my tests in a :vsplit window.

~~~vim
nnoremap <Leader>r <C-w>l<Insert>clear<CR>mix test<CR><C-\><C-n><C-w>h
~~~


This will bind the leader key + 'r' to switch to the right split, clear the screen, run mix test, and return to the left split.

This isn't ideal and could use a bit of improvement, but it's good to switch things up occasionally.

**UPDATE**: I switched it up and now resort to opening a new vsplit for tests

~~~vim
nnoremap <Leader>r :vsplit<CR>:term mix test<CR>
~~~


**UPDATE #2**: I pity the fool

[MrT](https://github.com/ruby2elixir/mr_t) works wonderfully for keeping that feedback loop tight. The structure is a bit rigid at the moment. It currently will not run tests for a module unless the file names match, e.g. `something.ex` and `something_test.exs`. I keep it running and still fire off single tests using [neoterm](https://github.com/kassio/neoterm).
