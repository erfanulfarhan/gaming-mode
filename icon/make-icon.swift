// Draws the Gaming Mode icon (an original controller drawing) as a 1024 px PNG.
// Usage: swift make-icon.swift out.png
import AppKit

let size: CGFloat = 1024
func rgb(_ hex: Int, _ a: CGFloat = 1) -> NSColor {
    NSColor(srgbRed: CGFloat((hex >> 16) & 255) / 255, green: CGFloat((hex >> 8) & 255) / 255,
            blue: CGFloat(hex & 255) / 255, alpha: a)
}
func rounded(_ x: CGFloat, _ y: CGFloat, _ w: CGFloat, _ h: CGFloat, _ r: CGFloat) -> NSBezierPath {
    NSBezierPath(roundedRect: NSRect(x: x, y: y, width: w, height: h), xRadius: r, yRadius: r)
}
func circle(_ cx: CGFloat, _ cy: CGFloat, _ r: CGFloat) -> NSBezierPath {
    NSBezierPath(ovalIn: NSRect(x: cx - r, y: cy - r, width: 2 * r, height: 2 * r))
}
func rotated(_ p: NSBezierPath, _ degrees: CGFloat, around c: NSPoint) -> NSBezierPath {
    let t = NSAffineTransform()
    t.translateX(by: c.x, yBy: c.y); t.rotate(byDegrees: degrees); t.translateX(by: -c.x, yBy: -c.y)
    p.transform(using: t as AffineTransform)
    return p
}

let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: Int(size), pixelsHigh: Int(size),
                           bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
                           colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)

// Background squircle
let bg = rounded(100, 100, 824, 824, 185)
NSGradient(starting: rgb(0x7C5CFF), ending: rgb(0x24175F))!.draw(in: bg, angle: -90)

// Controller body and grips, with a soft shadow
NSGraphicsContext.saveGraphicsState()
let shadow = NSShadow()
shadow.shadowColor = rgb(0x0B0624, 0.45); shadow.shadowBlurRadius = 36; shadow.shadowOffset = NSSize(width: 0, height: -18)
shadow.set()
let body = NSBezierPath()
body.append(rounded(250, 420, 524, 230, 115))
body.append(rotated(rounded(262, 300, 170, 290, 85), -22, around: NSPoint(x: 347, y: 445)))
body.append(rotated(rounded(592, 300, 170, 290, 85), 22, around: NSPoint(x: 677, y: 445)))
body.windingRule = .nonZero
rgb(0xF6F3FF).setFill(); body.fill()
NSGraphicsContext.restoreGraphicsState()

// D-pad
let ink = rgb(0x2E2178)
ink.setFill()
rounded(301, 517, 124, 42, 12).fill()
rounded(342, 476, 42, 124, 12).fill()

// Face buttons
let cx: CGFloat = 664, cy: CGFloat = 538
rgb(0xFF6B8B).setFill(); circle(cx, cy + 42, 23).fill()
ink.setFill(); circle(cx, cy - 42, 23).fill(); circle(cx - 42, cy, 23).fill(); circle(cx + 42, cy, 23).fill()

// Centre buttons
rgb(0xB7AEE6).setFill()
rounded(467, 560, 40, 16, 8).fill()
rounded(517, 560, 40, 16, 8).fill()

NSGraphicsContext.restoreGraphicsState()
try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: CommandLine.arguments[1]))
