# Markdown example

Hello, `markdown`!

Hello multi-line code:

```
def myfunc(i):
    return i + 1
```

And an image:

![](logo.png)

# OurBigBook Markdown extensions
{parent=Markdown example}

You can use any sane named argument that you want:

\OurBigBookExample[[
Hello my \b[bold text]!

And here a sane quote:

\Q[Hello world!]
{description=My nice quote. This is also markdown: [link to example](http://example.com) site.}
]]

And you can add OurBigBook arguments to shortcut Markup syntax:

\OurBigBookExample[[
![](logo.png)
{description=OurBigBook logo with a description!}
]]

\Include[markdown-example-child]

# OurBigBook Markdown extensions h3
{parent=OurBigBook Markdown extensions}

# OurBigBook Markdown extensions h4
{parent=OurBigBook Markdown extensions h3}

# OurBigBook Markdown extensions h5
{parent=OurBigBook Markdown extensions h4}

# OurBigBook Markdown extensions h6
{parent=OurBigBook Markdown extensions h5}

# OurBigBook Markdown extensions h7
{parent=OurBigBook Markdown extensions h6}

# OurBigBook Markdown extensions h8
{parent=OurBigBook Markdown extensions h7}
