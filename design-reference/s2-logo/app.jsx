// app.jsx — Phase 2 v4 · Logo Explorations
// Direction A re-defined as Hebrew wordmark explorations with actual
// letterform modification (per m0042/m0043/m0044 counter trail).

const W = 760;
const H = 1180;

function App() {
  return (
    <DesignCanvas>
      <DCSection
        id="A"
        title="Direction A · Hebrew wordmark · v4 (letterform modification)"
        subtitle="Spine of the system · 4 explorations · full מהמקור wordmark · app-icon strategy reversed (wordmark primary, מ favicon-source)"
      >
        <DCArtboard id="A1" label="A1 · Two Different Mems" width={W} height={H}><A1/></DCArtboard>
        <DCArtboard id="A2" label="A2 · The Stroke Ligature" width={W} height={H}><A2/></DCArtboard>
        <DCArtboard id="A3" label="A3 · The Extended Tail" width={W} height={H}><A3/></DCArtboard>
        <DCArtboard id="A4" label="A4 · The Reshaped Serifs" width={W} height={H}><A4/></DCArtboard>
      </DCSection>

      <DCSection
        id="B"
        title="Direction B · Wordmark + punctuation accent"
        subtitle="Secondary · 2 explorations · device-as-identity · monogram unaltered"
      >
        <DCArtboard id="B1" label="B1 · The Center Dot" width={W} height={1000}><B1/></DCArtboard>
        <DCArtboard id="B2" label="B2 · The Hairline" width={W} height={1000}><B2/></DCArtboard>
      </DCSection>

      <DCSection
        id="C"
        title="Direction C · Wordmark + abstract editorial device"
        subtitle="Fallback · 2 explorations · per G3 rewrite (no botanical)"
      >
        <DCArtboard id="C1" label="C1 · The Stamp" width={W} height={1000}><C1/></DCArtboard>
        <DCArtboard id="C2" label="C2 · The Cut Rule" width={W} height={1000}><C2/></DCArtboard>
      </DCSection>

      <DCSection
        id="D"
        title="Direction D · Courtesy script · gated / archived"
        subtitle="1 exploration · LOCK-tension proof · not advanced to Phase 3"
      >
        <DCArtboard id="D1" label="D1 · The Courtesy Script" width={W} height={1100}><D1/></DCArtboard>
      </DCSection>
    </DesignCanvas>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App/>);
