# Not index md

Hello, `markdown`!

Hello multi-line code:

```
def myfunc(i):
    return i + 1
```

## Not index md h2 1

Markdown **bold** and *italic* can be mixed with native macros: \b[also bold] and \i[also italic]. Macros can nest too: \b[bold with \i[italic inside]].

The arguments in square brackets are positional (unnamed). For example, `\a[https://ourbigbook.com][OurBigBook]` takes a URL followed by a label:

\a[https://ourbigbook.com][OurBigBook]

## Not index md h2 2

Named arguments go in braces. This native header uses two positional arguments (`3` and its title), plus named `id` and `numbered` arguments:

\H[3][A native header inside Markdown]
{id=not-index-md-native-header}
{numbered=0}

Normal Markdown continues here. The macro `\b[identified bold]{id=not-index-md-bold}` also accepts a named argument:

\b[identified bold]{id=not-index-md-bold}

Code keeps macro syntax literal: `\b[this is code, not bold]`.

Finally, `\Include[not-index-md-child]` includes a native `.bigb` article directly from this Markdown file:

\Include[not-index-md-child]
