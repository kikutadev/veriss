// 案 D: 型付きのスタイル値(StyleX・React Native の StyleSheet に近い)。ADR-0015 案 D
// (提案のスケッチ。layout / text / inter / Box / Text はまだどこにもない)
const card = layout.flex({ direction: 'column', gap: 8, padding: 12 });
const title = text({ font: inter(600, 16, 24), lines: 1, length: [1, 40] }); // S3 の契約も値の一部

<Box layout={card} noshift={['open']}>
  <Text style={title}>{props.title}</Text>
  <Box item={card.item({ grow: 1 })} />   {/* flex の子にだけ書ける性質(S1 の INERT が型の誤り) */}
</Box>
