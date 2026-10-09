// Draws the Gaming Mode icon: a game controller on a dark purple squircle.
// Usage: swift make-icon.swift out.png
import AppKit

let size: CGFloat = 1024
let image = NSImage(size: NSSize(width: size, height: size))
image.lockFocus()
let inset: CGFloat = 100
let rect = NSRect(x: inset, y: inset, width: size - 2 * inset, height: size - 2 * inset)
let shape = NSBezierPath(roundedRect: rect, xRadius: 185, yRadius: 185)
NSGradient(starting: NSColor(calibratedRed: 0.42, green: 0.20, blue: 0.95, alpha: 1),
           ending: NSColor(calibratedRed: 0.10, green: 0.06, blue: 0.30, alpha: 1))!.draw(in: shape, angle: -90)
let glyph = NSAttributedString(string: "🎮", attributes: [.font: NSFont.systemFont(ofSize: 520)])
let g = glyph.size()
glyph.draw(at: NSPoint(x: (size - g.width) / 2, y: (size - g.height) / 2 + 10))
image.unlockFocus()
let rep = NSBitmapImageRep(data: image.tiffRepresentation!)!
try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: CommandLine.arguments[1]))
