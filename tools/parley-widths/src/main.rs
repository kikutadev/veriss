// Prints the max-content width of each argument string in one font file at 16px (parley shaping and layout).
use parley::{FontContext, LayoutContext, StyleProperty, FontStack};
fn main() {
    let mut args = std::env::args().skip(1);
    let file = args.next().expect("font file");
    let family = args.next().expect("family name");
    let mut fcx = FontContext::new();
    fcx.collection.register_fonts(std::fs::read(&file).unwrap().into(), None);
    let mut lcx: LayoutContext<()> = LayoutContext::new();
    for text in args {
        let mut builder = lcx.ranged_builder(&mut fcx, &text, 1.0, true);
        builder.push_default(StyleProperty::FontStack(FontStack::Source(family.clone().into())));
        builder.push_default(StyleProperty::FontSize(16.0));
        let mut layout = builder.build(&text);
        layout.break_all_lines(None);
        println!("{}\t{}", text, layout.width());
    }
}
