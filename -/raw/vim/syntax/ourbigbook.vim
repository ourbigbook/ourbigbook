if exists("b:current_syntax")
  finish
endif

let b:current_syntax = "ourbigbook"

syntax match ourbigbookDelimiter '[\[\]]'
syntax match ourbigbookDelimiterX '\[' nextgroup=ourbigbookArgumentX contained
syntax match ourbigbookDelimiter '[{}]' nextgroup=ourbigbookArgumentName
syntax match ourbigbookArgumentName '[a-zA-Z0-9_]\+' contained nextgroup=ourbigbookArgumentNameEquals contains=@NoSpell
syntax match ourbigbookArgumentName 'child' contained nextgroup=ourbigbookArgumentNameEqualsParent contains=@NoSpell
syntax match ourbigbookArgumentName 'parent' contained nextgroup=ourbigbookArgumentNameEqualsParent contains=@NoSpell
syntax match ourbigbookArgumentName 'tag' contained nextgroup=ourbigbookArgumentNameEqualsParent contains=@NoSpell
syntax match ourbigbookArgumentNameEquals '=' contained nextgroup=ourbigbookArgumentNameEquals
syntax match ourbigbookArgumentNameEqualsParent '=' contained nextgroup=ourbigbookArgumentParent
highlight ourbigbookDelimiter          gui=bold cterm=bold term=bold
highlight ourbigbookDelimiterX         gui=bold cterm=bold term=bold
highlight link ourbigbookMacroXAngle           Label
highlight link ourbigbookMacroXAngleBeforeHash Label
highlight link ourbigbookDelimiterXAngleClose  Label
highlight ourbigbookArgumentNameEquals gui=bold cterm=bold term=bold
highlight link ourbigbookArgumentName Label

syntax match ourbigbookHeader "^=\+ .*$"
highlight link ourbigbookHeader Title

"syntax region ourbigbookCode start=/^\s*`\{2,}$/ end=/^\s*`\{2,}$/ contains=@NoSpell
"syntax match ourbigbookCode /`[^`]\+`/ contains=@NoSpell
syntax region ourbigbookCode start=/\z(`\+\)/ end=/\z1/ contains=@NoSpell
highlight link ourbigbookCode Identifier
" TODO can't find a way to match N times [ with n times] ]
"syntax region ourbigbookLiteral start=/\z(\[\{2,}\)/ end=/\z1/ contains=@NoSpell
syntax region ourbigbookLiteral start=/\[\[/ end=/\]\]/ contains=@NoSpell
syntax region ourbigbookLiteral start=/\[\[\[/ end=/\]\]\]/ contains=@NoSpell
syntax region ourbigbookLiteral start=/\[\[\[\[/ end=/\]\]\]\]/ contains=@NoSpell
syntax region ourbigbookLiteral start=/{{/ end=/}}/ contains=@NoSpell
syntax region ourbigbookLiteral start=/{{{/ end=/}}}/ contains=@NoSpell
syntax region ourbigbookLiteral start=/{{{{/ end=/}}}}/ contains=@NoSpell
highlight link ourbigbookLiteral Identifier

" TODO get TeX syntax highlighting inside $$ $$ working some day:
" https://vim.fandom.com/wiki/Different_syntax_highlighting_within_regions_of_a_file
" https://github.com/plasticboy/vim-markdown/blob/8e5d86f7b85234d3d1b4207dceebc43a768ed5d4/syntax/markdown.vim#L149
"syntax include @tex syntax/tex.vim
"syntax region ourbigbookMath start=/\z(\$\+\)/ end=/\z1/ contains=@tex keepend
syntax region ourbigbookMath start=/\z(\$\+\)/ end=/\z1/ contains=@NoSpell
highlight link ourbigbookMath Identifier

syntax match ourbigbookMacro /\\[a-zA-Z0-9_]\+/ contains=@NoSpell
" special a/x handling. treat ID like URL to prevent
" syntax errors so frequent in that case due to lowercasing.
syntax match ourbigbookMacroX '\\\(a\|x\|[Ii]mage\)\>' nextgroup=ourbigbookDelimiterX contains=@NoSpell
syntax match ourbigbookMacroXAngle '<' nextgroup=ourbigbookArgumentXAngle contains=@NoSpell
syntax match ourbigbookMacroXAngleBeforeHash '<\(#\)\@\=' nextgroup=ourbigbookMacroXHashSane contains=@NoSpell
syntax match ourbigbookMacroXHashSane '#' contained nextgroup=ourbigbookArgumentXAngle contains=@NoSpell
syntax match ourbigbookArgumentX /[^\]]\+/ contained contains=@NoSpell
syntax match ourbigbookArgumentXAngleOrHash /[^>]\+/ contained nextgroup=ourbigbookDelimiterXAngleClose contains=@NoSpell
syntax match ourbigbookArgumentXAngle /[^>]\+/ contained nextgroup=ourbigbookDelimiterXAngleClose contains=@NoSpell
syntax match ourbigbookDelimiterXAngleClose '>' contained contains=@NoSpell
syntax match ourbigbookArgumentParent /[^}]\+/ contained contains=@NoSpell
" Shorthand link.
syntax match ourbigbookMacroXHashShorthand '#' nextgroup=ourbigbookArgumentXShorthand contains=@NoSpell
syntax match ourbigbookArgumentXShorthand '[^[{\] \n]\+' contained contains=@NoSpell

highlight link ourbigbookMacro  Label
highlight link ourbigbookMacroX Label

syntax match ourbigbookUrl 'https\?://[^[{\] \n]\+' contains=@NoSpell
highlight link ourbigbookUrl            Special
highlight link ourbigbookArgumentX      Special
highlight link ourbigbookArgumentXAngle Special
highlight link ourbigbookArgumentXShorthand Special
highlight link ourbigbookArgumentParent Special
highlight link ourbigbookMacroXHashShorthand Label
highlight link ourbigbookMacroXHashSane Label

" Backslash escapes of magic chars.
syntax match ourbigbookNone /\\[<$`[\]{}#]/
highlight link ourbigbookNone NONE
