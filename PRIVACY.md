# Privacy policy

*inline-images, a mod for Claude Code. Effective 20 October 2026.*

inline-images runs entirely on your computer. It collects nothing, sends nothing anywhere, and the developer never receives any of your data. It makes no network connections and includes no analytics or telemetry.

## What it reads

- **The image Claude asks it to show**: one PNG file on your computer, named in the tool call. Screenshots can contain personal data; the mod reads the file only to draw the picture.
- **The location of your temp folder**, from the `TMPDIR` or `TEMP` environment variable. It reads no other environment variables.
- **The files it wrote earlier** (below), to draw a picture again when you scroll back or resume a session.

## What it stores, and for how long

For each picture, the mod writes three files to a folder named `claude-inline-images` in your system's temp folder:

- an SVG copy of the image with the annotations drawn on it;
- the annotated picture the conversation shows;
- the caption and labels Claude gave the picture.

These files stay on your computer. Your operating system deletes them when it clears its temp folder, and you can delete them yourself at any time. The mod writes nowhere else.

## What it gives Claude

After showing a picture, the mod returns one line to Claude: the image's size, the crop, how many annotations it drew, and the path of the SVG copy. That line becomes part of your Claude Code conversation, which Claude Code and Anthropic handle under their own terms and privacy policy. The mod does not send the picture itself to Claude.

## Children

The mod is not directed at children under 18.

## Changes and contact

Changes to this policy are published in this file, and its history is on GitHub. For questions, open an issue at https://github.com/nicolopignatelli/claude-code-inline-images/issues.
