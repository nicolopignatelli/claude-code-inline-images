# Examples

## A layout review

You're working on a sign-up form and ask Claude:

> Take a screenshot of the sign-up page and tell me what looks off.

Claude takes the screenshot ([`signup-screenshot.png`](signup-screenshot.png), 2400×1520), looks at it, and finds two layout bugs. Instead of describing where they are, it calls the mod's tool:

```json
{
  "path": "signup-screenshot.png",
  "crop": { "x": 0.27, "y": 0.15, "width": 0.6, "height": 0.67 },
  "annotations": [
    { "kind": "box", "x": 0.546, "y": 0.646, "width": 0.134, "height": 0.07, "label": "the button label is clipped" },
    { "kind": "arrow", "from": { "x": 0.82, "y": 0.43 }, "to": { "x": 0.652, "y": 0.485 }, "label": "the email field is narrower than the others" }
  ],
  "caption": "Two layout bugs on the sign-up form"
}
```

The crop keeps the form and drops the empty page around it. The box frames the button, and the arrow's tip sits on the email field's right edge, which stops short of the fields above and below it.

In a terminal that draws images (kitty, Ghostty), this appears in the conversation:

![The inline picture](signup-inline.png)

```
Two layout bugs on the sign-up form
1  the button label is clipped
2  the email field is narrower than the others
file:///var/folders/…/T/claude-inline-images/toolu_01L2ZM3hJG7jz1J9tXhNCwbg.svg
```

In any other terminal you get the four text lines. Click the `file://` line, or open the path, to see the SVG copy with the labels as text:

![The SVG copy](signup-svg.png)

Claude receives one line back, not the picture, so the conversation stays small:

```
Shown to the person inline (2400x1520, cropped to 1440x1019 at (648, 228), 2 annotation(s)). SVG copy with text labels: /var/folders/…/claude-inline-images/toolu_01L2ZM3hJG7jz1J9tXhNCwbg.svg
```

## More things to ask

- "Show me the part of the dashboard you mean, and put an arrow on the number that's wrong."
- "Compare the two screenshots: box what changed in each."
- "Extract the frame at 1:12 from `trailer.mp4` and point at where the subtitle overlaps the logo."
- "Crop the diagram to the auth flow and label the step that's missing."

The demo page is fictional. Its source is not part of this repository, only the screenshot.
