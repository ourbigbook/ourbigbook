if exists("b:current_syntax")
  finish
endif

let b:current_syntax = "cirodown"

"syn region matchgroup=mkdHeading start='^=\+ ' end='$'

syntax match cirodownDelimiter '[\[\]]'
syntax match cirodownDelimiter '[{}]' nextgroup=cirodownArgumentName
syntax match cirodownArgumentName '[a-zA-Z0-9_]\+' contained nextgroup=cirodownArgumentNameEquals
syntax match cirodownArgumentNameEquals '=' contained nextgroup=cirodownArgumentNameEquals
highlight cirodownDelimiter          gui=bold cterm=bold term=bold
highlight cirodownArgumentNameEquals gui=bold cterm=bold term=bold
highlight link cirodownArgumentName Label

syntax match cirodownHeader "^=\+ .*$"
highlight link cirodownHeader Title

syntax region cirodownCodeBlock start=/^\s*`\{2,}$/ end=/^\s*`\{2,}$/ contains=@NoSpell
highlight link cirodownCodeBlock Identifier

syntax region cirodownMathBlock start=/^\s*\$\{2,}$/ end=/^\s*\$\{2,}$/ contains=@NoSpell
highlight link cirodownMathBlock Identifier

syntax match cirodownMacro /\\[a-zA-Z0-9_]\+/
highlight link cirodownMacro Label

syntax match cirodownUrl 'https\?://[^[\] \n]\+' contains=@NoSpell
highlight link cirodownUrl Special
