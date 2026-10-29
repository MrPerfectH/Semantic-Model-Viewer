# Learning library

Short recordings, downloadable PDF walkthroughs, and practical guides for Semantic
Model Viewer. Start with the topic you need, then try it on the
[synthetic Contoso Retail demo](https://MrPerfectH.github.io/Semantic-Model-Viewer/)
or your own supported model.

[Back to the project](../README.md) · [Open the demo](https://MrPerfectH.github.io/Semantic-Model-Viewer/) · [Get the Viewer](installation.md)

## Watch a workflow

Select a recording to open its GitHub file page, where you can play or download the MP4.

| Recording | Length | What you will learn |
| --- | --- | --- |
| [From a table to the DAX behind a measure](media/library/table-to-dax-walkthrough.mp4) | 28 seconds | Follow the VS Code workflow from model exploration into dependent measures and expanded DAX. This is the short recording prepared for the October 23 post. |
| [Focus the table canvas](media/library/focus-tables.mp4) | 24 seconds | Dim unrelated tables, change the selected table, then hide unrelated tables and arrange a focused view. |
| [Install the VS Code extension](media/library/install-extension.mp4) | 10 seconds | Find Semantic Model Viewer in the Marketplace and reach the model list. |

For a slower, step-by-step explanation, open the
[illustrated VS Code guide](https://github.com/MrPerfectH/Semantic-Model-Viewer/blob/main/docs/vscode-guide.md).
It includes additional animated demonstrations of selecting dependent measures and inlining DAX.

The installation recording shows version 0.3.9. Table and column dependency workflows
require version 0.4.0 or newer. These recordings use synthetic data and show the
workflow as captured; current controls and appearance may differ.

## Download a PDF walkthrough

### Explore your Power BI model: Dim, Hide & Lock

Four slides show how to start with Sales, dim unrelated tables to retain context,
hide them to focus the canvas, and lock Sales while exploring Inventory.
Select a table, then use **Canvas focus** in its inspector to choose Dim or Hide.
Hover over the table header to reveal the lock control.

| Download | Pages | Appearance |
| --- | --- | --- |
| [Dim, Hide & Lock — Classic](materials/focus-your-canvas-classic.pdf) | 4 | The Classic edition used for the October 26 post. Start here. |
| [Dim, Hide & Lock — Spellbook](materials/focus-your-canvas-spellbook.pdf) | 4 | The same walkthrough in the parchment appearance. |

Open a PDF on GitHub to read it, or use its download control to save a copy.
Both editions use actual app captures of the synthetic Contoso Retail model.
They change the presentation of the canvas; hiding a table does not delete it from the model.

## Read a practical guide

| I want to… | Material |
| --- | --- |
| Open my first model or run the portable app | [Installation and supported input](installation.md) |
| Explore relationships, filter paths, and layouts | [Tables](viewer-guide.md#tables) |
| Find which measures use a table or column | [Table and column dependency analysis](viewer-guide.md#table-and-column-references) |
| Trace calculations and compare DAX | [Measures](viewer-guide.md#measures) |
| Follow query inputs and inspect M | [Power Query](viewer-guide.md#power-query) |
| Understand the whole model | [Domains and Matrix](viewer-guide.md#additional-domains-and-matrix) |
| Browse model objects and definitions | [Searchable model reference](model-reference.md) |
| Send an explorable model to a colleague | [Interactive HTML snapshots](snapshots.md) |
| Automate exports or work with an agent | [CLI](cli.md) · [Claude Code plugin](claude-code-plugin.md) · [Visual explanations](visual-explanations.md) |

## Explore the screenshots and sample model

- [All eight feature screenshots](viewer-guide.md#screens): Tables, Measures, Power Query, Domains, and Matrix.
- [Contoso Retail TMDL source](../Models/demo/Contoso%20Retail.SemanticModel): inspect the synthetic model used in the demonstrations.
- [Original introduction on LinkedIn](https://www.linkedin.com/posts/przemyslaw-harazny_powerbi-dax-semanticmodels-activity-7516511461960220672-hqjP): the initial launch post and discussion. LinkedIn may require sign-in.

The materials demonstrate static metadata inspection. The Viewer does not execute
DAX or M. Interactive snapshots include full model metadata, DAX, and available M;
see [snapshot sharing](snapshots.md) before sharing your own model.

Have a question that these materials do not answer?
[Suggest a tutorial or ask a question](https://github.com/MrPerfectH/Semantic-Model-Viewer/issues/new/choose).
