autocmd BufNewFile,BufRead *.bigb set filetype=ourbigbook
autocmd FileType ourbigbook set shiftwidth=2 tabstop=2
" Start searching for a pattern in a header in the current file.
autocmd FileType ourbigbook nnoremap <buffer> <leader>f /\v\= 
autocmd FileType ourbigbook nnoremap <buffer> <leader>h :ObbGitGrep 
autocmd FileType ourbigbook command! -nargs=+ ObbGitGrep execute 'silent Ggrep! -i "^= <args>"' | tab copen

