# Asset manifest specification

The agent should generate a machine-readable manifest for `/assets/visual/`.

Recommended fields:
- id
- absolutePath
- relativePath
- filename
- extension
- mimeType
- sizeBytes
- width
- height
- aspectRatio
- orientation
- captureDate if extractable
- peopleCount if inferable
- hasFaces
- blurScore
- brightnessScore
- colorfulnessScore
- candidateUses
- notes
- derivativePaths
- representativeOnly (boolean)

Suggested candidateUses vocabulary:
- hero
- team
- carousel
- background
- story
- contact
- discard

Notes:
- originals may be print-resolution and must not be used directly in production
- videos should get poster frames and compressed web derivatives
- assets in `assets/representative/` should usually have `representativeOnly: true` unless independently selected on merit
