/* @ds-bundle: {"format":3,"namespace":"MehamakorDesignSystem_0e2820","components":[{"name":"MeatIcon","sourcePath":"assets/CategoryIcons.jsx"},{"name":"VegIcon","sourcePath":"assets/CategoryIcons.jsx"},{"name":"DairyIcon","sourcePath":"assets/CategoryIcons.jsx"},{"name":"BreadIcon","sourcePath":"assets/CategoryIcons.jsx"},{"name":"OilIcon","sourcePath":"assets/CategoryIcons.jsx"},{"name":"SoapIcon","sourcePath":"assets/CategoryIcons.jsx"},{"name":"CATEGORY_ICONS","sourcePath":"assets/CategoryIcons.jsx"},{"name":"MapComponent","sourcePath":"frontend/components/MapComponent.jsx"},{"name":"CATEGORY_STYLES","sourcePath":"frontend/lib/map-categories.js"},{"name":"DEFAULT_CATEGORY_STYLE","sourcePath":"frontend/lib/map-categories.js"},{"name":"CATEGORY_LEGEND","sourcePath":"frontend/lib/map-categories.js"},{"name":"BottomNav","sourcePath":"source/BottomNav.jsx"},{"name":"Footer","sourcePath":"source/Footer.jsx"},{"name":"Header","sourcePath":"source/Header.jsx"},{"name":"ProducerCard","sourcePath":"source/ProducerCard.jsx"},{"name":"HomePage","sourcePath":"source/page.js"}],"sourceHashes":{"MapClient.jsx":"3d34d12df2ac","assets/CategoryIcons.jsx":"7761ba443109","chips-and-cards.jsx":"a6ddee3ce61e","data.js":"18bfcea72ed5","frontend/components/MapComponent.jsx":"6786ff97de84","frontend/lib/map-categories.js":"88037eff9403","homepage/parts/BusinessAndFooter.jsx":"731b24f3f581","homepage/parts/CategoryGrid.jsx":"319e49355a68","homepage/parts/EditorialBreath.jsx":"350f0313c34f","homepage/parts/FeaturedProducers.jsx":"6952c76262fd","homepage/parts/Header.jsx":"e2a77a35fd14","homepage/parts/Hero.jsx":"c3a5062cf8f6","homepage/parts/HowItWorks.jsx":"d2fa0285e241","homepage/parts/MeetAProducer.jsx":"513777b853e8","homepage/parts/OliveBranch.jsx":"9bd46ea788c5","homepage/parts/ProducerCard.jsx":"41ada5677a3b","homepage/parts/icons.jsx":"fed0cdbc2d04","parts/App.jsx":"6b7314dac034","parts/App2.jsx":"ec8cb4a946cc","parts/CategoryGrid2.jsx":"ff919a89c217","parts/HeroDesktop.jsx":"8992fa1999dd","parts/HeroMobile.jsx":"f9876468d4fe","parts/Icons2.jsx":"1b84a0355571","parts/Logo.jsx":"c5224d001af0","parts/OliveBranch.jsx":"aac3c5f20f18","parts/ProducerCard2.jsx":"dc01954ddd5d","pins.jsx":"c6bc132dfea3","source/BottomNav.jsx":"5c10af534a53","source/Footer.jsx":"2a4d8861b64d","source/Header.jsx":"27aa67d2d1e4","source/ProducerCard.jsx":"1b3552b4eccb","source/page.js":"b26cf0150150","source/tailwind.config.js":"86a3abd5dea2","ui_kits/mobile/ios-frame.jsx":"d67eb3ffe562","ui_kits/mobile/m-icons.jsx":"17e5ef61d47f","ui_kits/mobile/screens.jsx":"d53700f6215e","ui_kits/website/CategoryGrid.jsx":"319e49355a68","ui_kits/website/EditorialSections.jsx":"27f2be5f227e","ui_kits/website/Header.jsx":"e2a77a35fd14","ui_kits/website/Hero.jsx":"c3a5062cf8f6","ui_kits/website/ProducerCard.jsx":"41ada5677a3b","ui_kits/website/ProducerGrid.jsx":"7853c02c4c66","ui_kits/website/Sections.jsx":"0c79291a0b43","ui_kits/website/icons.jsx":"fed0cdbc2d04"},"inlinedExternals":[],"unexposedExports":[{"name":"styleForProducer","sourcePath":"frontend/lib/map-categories.js"}]} */

(() => {

const __ds_ns = (window.MehamakorDesignSystem_0e2820 = window.MehamakorDesignSystem_0e2820 || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// MapClient.jsx
try { (() => {
/* MapClient — main redesigned map page component.
   Desktop: 60% map / 40% list panel.
   Mobile: full-screen map + draggable bottom sheet (handle / half / full).
*/

function MapClient({
  isMobile = false
}) {
  const [filters, setFilters] = React.useState({});
  const [selectedId, setSelectedId] = React.useState(null);
  const [hoverId, setHoverId] = React.useState(null);
  const [showSearchBtn, setShowSearchBtn] = React.useState(false);
  const [showCityPicker, setShowCityPicker] = React.useState(false);
  const [city, setCity] = React.useState('תל אביב');
  const [sheetSnap, setSheetSnap] = React.useState('half'); // handle | half | full
  const [dragging, setDragging] = React.useState(false);
  const [dragY, setDragY] = React.useState(null);
  const [dragStartY, setDragStartY] = React.useState(null);
  const listRef = React.useRef(null);
  const cardRefs = React.useRef({});
  const hoverTimerRef = React.useRef(null);

  /* Filter logic */
  const filtered = React.useMemo(() => {
    return PRODUCERS.filter(p => {
      if (filters.organic && !p.organic) return false;
      if (filters.delivery && !p.delivery) return false;
      if (filters.verified && !p.verified) return false;
      const catsActive = FILTER_CATEGORIES.filter(c => filters[c]);
      if (catsActive.length && !catsActive.includes(p.category)) return false;
      return true;
    });
  }, [filters]);
  const activeCount = Object.values(filters).filter(Boolean).length;
  const toggleFilter = key => setFilters(f => ({
    ...f,
    [key]: !f[key]
  }));
  const resetFilters = () => setFilters({});

  /* Mock map click -> show "search this area" */
  const onMapPan = () => setShowSearchBtn(true);

  /* Scroll active card into view */
  React.useEffect(() => {
    if (!selectedId) return;
    const el = cardRefs.current[selectedId];
    const container = listRef.current;
    if (!el || !container) return;
    const top = el.offsetTop - container.offsetTop - 8;
    container.scrollTo({
      top,
      behavior: 'smooth'
    });
  }, [selectedId]);

  /* Debounced hover from card -> map */
  const handleCardHover = id => {
    clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = setTimeout(() => setHoverId(id), 400);
  };
  const handleCardLeave = () => {
    clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = setTimeout(() => setHoverId(null), 400);
  };

  /* Mobile sheet drag */
  const sheetHeight = sheetSnap === 'full' ? '90vh' : sheetSnap === 'half' ? '45vh' : '56px';
  const sheetTransform = dragging && dragY != null ? `translateY(${Math.max(0, dragY - dragStartY)}px)` : 'translateY(0)';
  const onPointerDown = e => {
    setDragging(true);
    setDragStartY(e.clientY || e.touches?.[0]?.clientY);
    setDragY(e.clientY || e.touches?.[0]?.clientY);
  };
  const onPointerMove = e => {
    if (!dragging) return;
    setDragY(e.clientY || e.touches?.[0]?.clientY);
  };
  const onPointerUp = () => {
    if (!dragging) return;
    const delta = dragY - dragStartY;
    if (delta > 80) {
      // Drag down: full->half, half->handle
      if (sheetSnap === 'full') setSheetSnap('half');else if (sheetSnap === 'half') setSheetSnap('handle');
    } else if (delta < -80) {
      if (sheetSnap === 'handle') setSheetSnap('half');else if (sheetSnap === 'half') setSheetSnap('full');
    }
    setDragging(false);
    setDragStartY(null);
    setDragY(null);
  };

  /* Header content shared */
  const headerBlock = /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      marginBottom: 12
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("h1", {
    style: {
      fontFamily: 'var(--font-headline)',
      fontWeight: 700,
      fontSize: 22,
      color: 'var(--fg)',
      margin: 0,
      lineHeight: 1.2
    }
  }, "\u05DE\u05E4\u05EA \u05D1\u05EA\u05D9 \u05E2\u05E1\u05E7"), /*#__PURE__*/React.createElement("p", {
    style: {
      fontFamily: 'var(--font-body)',
      fontSize: 13,
      color: 'var(--fg-muted)',
      margin: '4px 0 0'
    }
  }, filtered.length, " \u05D1\u05EA\u05D9 \u05E2\u05E1\u05E7 \u05D1", city)), /*#__PURE__*/React.createElement("button", {
    onClick: () => setShowCityPicker(true),
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      background: '#fff',
      border: '1px solid var(--border)',
      padding: '8px 14px',
      borderRadius: 9999,
      fontFamily: 'var(--font-body)',
      fontWeight: 500,
      fontSize: 13,
      color: 'var(--fg)',
      cursor: 'pointer'
    }
  }, "\uD83D\uDCCD ", city)), /*#__PURE__*/React.createElement(FilterChipsRow, {
    filters: filters,
    onToggle: toggleFilter,
    onReset: resetFilters,
    activeCount: activeCount
  }));
  const listBlock = /*#__PURE__*/React.createElement("div", {
    ref: listRef,
    className: "hide-scrollbar",
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
      overflowY: 'auto',
      flex: 1,
      padding: '4px 0 20px'
    }
  }, filtered.length === 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: 'center',
      padding: '48px 16px',
      color: 'var(--fg-muted)',
      fontFamily: 'var(--font-headline)',
      fontSize: 18
    }
  }, "\u05DC\u05D0 \u05DE\u05E6\u05D0\u05E0\u05D5 \u05E2\u05E1\u05E7\u05D9\u05DD \u05D1\u05D0\u05D6\u05D5\u05E8 \u05D4\u05D6\u05D4 \u2014 \u05E2\u05D3\u05D9\u05D9\u05DF \uD83C\uDF31"), filtered.map(p => /*#__PURE__*/React.createElement(CondensedCard, {
    key: p.id,
    p: p,
    active: selectedId === p.id,
    cardRef: el => {
      cardRefs.current[p.id] = el;
    },
    onMouseEnter: () => handleCardHover(p.id),
    onMouseLeave: handleCardLeave,
    onClick: () => setSelectedId(p.id)
  })));

  /* Desktop layout */
  if (!isMobile) {
    return /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        height: '100%',
        width: '100%',
        background: 'var(--bg)'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        width: '60%',
        height: '100%',
        position: 'relative'
      }
    }, /*#__PURE__*/React.createElement(MockMap, {
      producers: filtered,
      selectedId: selectedId,
      hoverId: hoverId,
      onSelect: id => setSelectedId(id),
      onHover: id => setHoverId(id),
      onPan: onMapPan
    }), showSearchBtn && /*#__PURE__*/React.createElement("button", {
      onClick: () => setShowSearchBtn(false),
      style: searchAreaBtnStyle
    }, "\uD83D\uDD0D \u05D7\u05E4\u05E9\u05D9 \u05D1\u05D0\u05D6\u05D5\u05E8 \u05D6\u05D4")), /*#__PURE__*/React.createElement("aside", {
      style: {
        width: '40%',
        height: '100%',
        background: 'var(--bg)',
        borderInlineStart: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        padding: '20px 20px 0'
      }
    }, headerBlock, /*#__PURE__*/React.createElement("div", {
      style: {
        height: 16
      }
    }), listBlock), showCityPicker && /*#__PURE__*/React.createElement(CityPicker, {
      city: city,
      onPick: c => {
        setCity(c);
        setShowCityPicker(false);
      },
      onClose: () => setShowCityPicker(false)
    }));
  }

  /* Mobile layout */
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      width: '100%',
      height: '100%',
      background: 'var(--bg)',
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement(MockMap, {
    producers: filtered,
    selectedId: selectedId,
    hoverId: hoverId,
    onSelect: id => {
      setSelectedId(id);
      setSheetSnap('half');
    },
    onHover: id => setHoverId(id),
    onPan: onMapPan,
    mobile: true
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: 12,
      insetInlineStart: 12,
      insetInlineEnd: 12,
      display: 'flex',
      justifyContent: 'space-between',
      gap: 8,
      zIndex: 500
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => setShowCityPicker(true),
    style: {
      background: '#fff',
      border: '1px solid var(--border)',
      padding: '10px 16px',
      borderRadius: 9999,
      fontFamily: 'var(--font-body)',
      fontWeight: 500,
      fontSize: 13,
      boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
      cursor: 'pointer'
    }
  }, "\uD83D\uDCCD ", city), /*#__PURE__*/React.createElement("button", {
    style: {
      background: '#fff',
      border: '1px solid var(--border)',
      width: 40,
      height: 40,
      borderRadius: '50%',
      boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
      cursor: 'pointer',
      fontSize: 16
    },
    "aria-label": "\u05D4\u05DE\u05D9\u05E7\u05D5\u05DD \u05E9\u05DC\u05D9"
  }, "\u2299")), showSearchBtn && /*#__PURE__*/React.createElement("button", {
    onClick: () => setShowSearchBtn(false),
    style: {
      ...searchAreaBtnStyle,
      top: 64
    }
  }, "\uD83D\uDD0D \u05D7\u05E4\u05E9\u05D9 \u05D1\u05D0\u05D6\u05D5\u05E8 \u05D6\u05D4"), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      height: sheetHeight,
      background: 'var(--bg)',
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      boxShadow: '0 -8px 32px rgba(0,0,0,0.12)',
      transform: sheetTransform,
      transition: dragging ? 'none' : 'height 300ms var(--ease-quart), transform 300ms var(--ease-quart)',
      display: 'flex',
      flexDirection: 'column',
      zIndex: 600,
      touchAction: 'none'
    },
    onMouseMove: onPointerMove,
    onMouseUp: onPointerUp,
    onMouseLeave: onPointerUp,
    onTouchMove: onPointerMove,
    onTouchEnd: onPointerUp
  }, /*#__PURE__*/React.createElement("div", {
    onMouseDown: onPointerDown,
    onTouchStart: onPointerDown,
    style: {
      padding: '10px 0 6px',
      cursor: 'grab',
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 40,
      height: 4,
      background: '#e8e0d0',
      borderRadius: 2,
      margin: '0 auto'
    }
  }), /*#__PURE__*/React.createElement("p", {
    style: {
      textAlign: 'center',
      margin: '8px 0 0',
      fontFamily: 'var(--font-body)',
      fontWeight: 500,
      fontSize: 14,
      color: 'var(--fg)'
    }
  }, filtered.length, " \u05D1\u05EA\u05D9 \u05E2\u05E1\u05E7 \u05D1", city)), sheetSnap !== 'handle' && /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '4px 16px 8px',
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement(FilterChipsRow, {
    filters: filters,
    onToggle: toggleFilter,
    onReset: resetFilters,
    activeCount: activeCount
  })), sheetSnap !== 'handle' && /*#__PURE__*/React.createElement("div", {
    ref: listRef,
    className: "hide-scrollbar",
    style: {
      flex: 1,
      overflowY: 'auto',
      padding: '8px 16px 20px',
      display: 'flex',
      flexDirection: 'column',
      gap: 10
    }
  }, filtered.map(p => /*#__PURE__*/React.createElement(CondensedCard, {
    key: p.id,
    p: p,
    active: selectedId === p.id,
    cardRef: el => {
      cardRefs.current[p.id] = el;
    },
    onClick: () => setSelectedId(p.id)
  })))), showCityPicker && /*#__PURE__*/React.createElement(CityPicker, {
    city: city,
    onPick: c => {
      setCity(c);
      setShowCityPicker(false);
    },
    onClose: () => setShowCityPicker(false)
  }));
}

/* "Search this area" button styles shared */
const searchAreaBtnStyle = {
  position: 'absolute',
  top: 20,
  left: '50%',
  transform: 'translateX(-50%)',
  background: '#F5F0E8',
  border: '1px solid var(--border)',
  padding: '10px 20px',
  borderRadius: 20,
  fontFamily: 'var(--font-body)',
  fontWeight: 500,
  fontSize: 13,
  color: 'var(--fg)',
  cursor: 'pointer',
  zIndex: 500,
  boxShadow: '0 4px 16px rgba(0,0,0,0.14)',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8
};

/* SVG glyph html for leaflet divIcons */
function glyphSVG(key) {
  const paths = {
    meat: `<g fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 15c0-3 2-6 6-6s8 2 8 6-3 6-7 6-7-2-7-6z"/><path d="M16 10l4-4"/><circle cx="20.5" cy="5.5" r="1.4"/></g>`,
    veg: `<g fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20V8"/><path d="M12 8c0 0-5-1.5-7 3 1.5.3 4.5 0 7 2"/><path d="M12 11c0 0 4.5-3 8 1-1.5.8-4.5.3-8 2"/></g>`,
    dairy: `<g fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6h6v2"/><path d="M8 8h8v11a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2V8z"/><path d="M8 12h8"/></g>`,
    bread: `<g fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13c0-3 3-5 7-5s7 2 7 5"/><path d="M5 13v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3z"/><path d="M9 8c0-1.5-.5-2.5 0-4"/><path d="M12 8c0-2-.5-3 0-4.5"/><path d="M15 8c0-1.5-.5-2.5 0-4"/></g>`,
    oil: `<g fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 9v10a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2V9z"/><path d="M8 9h8"/><path d="M9.5 6h5a1.5 1.5 0 0 1 1.5 1.5V9H8V7.5A1.5 1.5 0 0 1 9.5 6z"/><ellipse cx="12" cy="15" rx="1.8" ry="2.4"/></g>`,
    care: `<g fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20V10"/><path d="M12 10c0 0-4-1-5 2 1 .2 3 0 5 1.5"/><path d="M12 12c0 0 3.5-2 5.5 1-1 .5-3 .2-5.5 1.5"/><circle cx="12" cy="6" r="1.5"/></g>`
  };
  return paths[key] || paths.veg;
}
function CityPicker({
  city,
  onPick,
  onClose
}) {
  const [val, setVal] = React.useState('');
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'fixed',
      inset: 0,
      background: 'rgba(28,26,23,0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: 20
    },
    onClick: onClose
  }, /*#__PURE__*/React.createElement("div", {
    onClick: e => e.stopPropagation(),
    style: {
      background: 'var(--bg)',
      borderRadius: 20,
      padding: '32px 28px',
      maxWidth: 440,
      width: '100%',
      boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
    }
  }, /*#__PURE__*/React.createElement("h2", {
    style: {
      fontFamily: 'var(--font-headline)',
      fontWeight: 700,
      fontSize: 24,
      margin: 0,
      color: 'var(--fg)'
    }
  }, "\u05D0\u05D9\u05E4\u05D4 \u05D0\u05EA?"), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 13,
      color: 'var(--fg-muted)',
      margin: '6px 0 20px'
    }
  }, "\u05E0\u05E6\u05D9\u05D2 \u05DC\u05DA \u05D1\u05EA\u05D9 \u05E2\u05E1\u05E7 \u05D1\u05D0\u05D6\u05D5\u05E8 \u05E9\u05DC\u05DA"), /*#__PURE__*/React.createElement("input", {
    placeholder: "\u05D7\u05E4\u05E9\u05D9 \u05E2\u05D9\u05E8...",
    value: val,
    onChange: e => setVal(e.target.value),
    style: {
      width: '100%',
      background: 'var(--bg)',
      border: 'none',
      borderBottom: '1px solid var(--border)',
      padding: '10px 0',
      fontSize: 16,
      fontFamily: 'var(--font-body)',
      outline: 'none',
      color: 'var(--fg)'
    }
  }), /*#__PURE__*/React.createElement("p", {
    style: {
      fontFamily: 'var(--font-body)',
      fontSize: 11,
      fontWeight: 500,
      letterSpacing: '0.15em',
      textTransform: 'uppercase',
      color: 'var(--fg-muted)',
      margin: '24px 0 10px'
    }
  }, "\u05E2\u05E8\u05D9\u05DD \u05E4\u05D5\u05E4\u05D5\u05DC\u05E8\u05D9\u05D5\u05EA"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexWrap: 'wrap',
      gap: 8
    }
  }, CITIES.map(c => /*#__PURE__*/React.createElement("button", {
    key: c,
    onClick: () => onPick(c),
    style: {
      padding: '8px 14px',
      borderRadius: 9999,
      background: c === city ? 'var(--primary)' : '#fff',
      color: c === city ? '#fff' : 'var(--fg)',
      border: '1px solid var(--border)',
      fontFamily: 'var(--font-body)',
      fontSize: 13,
      cursor: 'pointer'
    }
  }, c)))));
}
Object.assign(window, {
  MapClient
});

/* MockMap — flat cream surface with grid + positioned pins.
   Replaces Leaflet for the mockup (OSM tiles blocked in preview).
   Maps producer lat/lng → local coords using TA bounds. */

const TA_BOUNDS = {
  latMin: 32.05,
  latMax: 32.20,
  lngMin: 34.76,
  lngMax: 34.96
};
function MockMap({
  producers,
  selectedId,
  hoverId,
  onSelect,
  onHover,
  onPan,
  mobile
}) {
  const [offset, setOffset] = React.useState({
    x: 0,
    y: 0
  });
  const [dragStart, setDragStart] = React.useState(null);
  const toPct = p => {
    const x = (p.lng - TA_BOUNDS.lngMin) / (TA_BOUNDS.lngMax - TA_BOUNDS.lngMin) * 100;
    // flip y: higher lat = top
    const y = (1 - (p.lat - TA_BOUNDS.latMin) / (TA_BOUNDS.latMax - TA_BOUNDS.latMin)) * 100;
    return {
      x,
      y
    };
  };
  const onMouseDown = e => setDragStart({
    x: e.clientX,
    y: e.clientY,
    ox: offset.x,
    oy: offset.y
  });
  const onMouseMove = e => {
    if (!dragStart) return;
    setOffset({
      x: dragStart.ox + (e.clientX - dragStart.x),
      y: dragStart.oy + (e.clientY - dragStart.y)
    });
  };
  const onMouseUp = () => {
    if (dragStart) {
      const moved = Math.abs(offset.x - dragStart.ox) + Math.abs(offset.y - dragStart.oy);
      if (moved > 8) onPan?.();
    }
    setDragStart(null);
  };
  return /*#__PURE__*/React.createElement("div", {
    onMouseDown: onMouseDown,
    onMouseMove: onMouseMove,
    onMouseUp: onMouseUp,
    onMouseLeave: onMouseUp,
    style: {
      position: mobile ? 'absolute' : 'relative',
      inset: mobile ? 0 : undefined,
      width: '100%',
      height: '100%',
      background: '#F5F0E8',
      overflow: 'hidden',
      cursor: dragStart ? 'grabbing' : 'grab'
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "100%",
    height: "100%",
    style: {
      position: 'absolute',
      inset: 0,
      pointerEvents: 'none'
    }
  }, /*#__PURE__*/React.createElement("defs", null, /*#__PURE__*/React.createElement("pattern", {
    id: "mm-grid",
    width: "40",
    height: "40",
    patternUnits: "userSpaceOnUse",
    patternTransform: `translate(${offset.x % 40} ${offset.y % 40})`
  }, /*#__PURE__*/React.createElement("path", {
    d: "M 40 0 L 0 0 0 40",
    fill: "none",
    stroke: "#e8e0d0",
    strokeWidth: "1"
  })), /*#__PURE__*/React.createElement("pattern", {
    id: "mm-grid-lg",
    width: "160",
    height: "160",
    patternUnits: "userSpaceOnUse",
    patternTransform: `translate(${offset.x % 160} ${offset.y % 160})`
  }, /*#__PURE__*/React.createElement("path", {
    d: "M 160 0 L 0 0 0 160",
    fill: "none",
    stroke: "#d8cfbb",
    strokeWidth: "1.2"
  }))), /*#__PURE__*/React.createElement("rect", {
    width: "100%",
    height: "100%",
    fill: "url(#mm-grid)"
  }), /*#__PURE__*/React.createElement("rect", {
    width: "100%",
    height: "100%",
    fill: "url(#mm-grid-lg)"
  }), /*#__PURE__*/React.createElement("g", {
    stroke: "#d8cfbb",
    strokeWidth: "2",
    fill: "none",
    opacity: "0.7",
    transform: `translate(${offset.x} ${offset.y})`
  }, /*#__PURE__*/React.createElement("path", {
    d: "M -50 60% Q 30% 48%, 70% 55% T 110% 62%"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M 30% -10 Q 40% 30%, 55% 50% T 70% 110%"
  })), /*#__PURE__*/React.createElement("ellipse", {
    cx: `calc(8% + ${offset.x}px)`,
    cy: `calc(82% + ${offset.y}px)`,
    rx: "120",
    ry: "80",
    fill: "#d8cfbb",
    opacity: "0.5",
    transform: `translate(${offset.x} ${offset.y})`
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      transform: `translate(${offset.x}px, ${offset.y}px)`
    }
  }, producers.map(p => {
    const {
      x,
      y
    } = toPct(p);
    const meta = CATEGORY_META[p.category];
    const selected = selectedId === p.id;
    const hovered = hoverId === p.id;
    const showPrice = selected || hovered;
    return /*#__PURE__*/React.createElement("div", {
      key: p.id,
      style: {
        position: 'absolute',
        left: `${x}%`,
        top: `${y}%`,
        transform: 'translate(-50%, -50%)',
        zIndex: selected ? 30 : hovered ? 20 : 10
      },
      onMouseEnter: () => onHover(p.id),
      onMouseLeave: () => onHover(null),
      onMouseDown: e => e.stopPropagation(),
      onClick: e => {
        e.stopPropagation();
        onSelect(p.id);
      }
    }, showPrice ? /*#__PURE__*/React.createElement("div", {
      className: `price-pin ${selected ? 'selected' : ''}`,
      style: {
        '--pin-color': meta.color,
        cursor: 'pointer'
      }
    }, p.price) : /*#__PURE__*/React.createElement("div", {
      className: "circle-pin",
      style: {
        '--pin-color': meta.color
      }
    }, /*#__PURE__*/React.createElement("svg", {
      viewBox: "0 0 24 24",
      dangerouslySetInnerHTML: {
        __html: glyphSVG(meta.key)
      }
    })));
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      bottom: 10,
      insetInlineStart: 10,
      fontFamily: "'Cormorant Garamond', serif",
      fontStyle: 'italic',
      fontSize: 11,
      color: '#a89f8a',
      pointerEvents: 'none'
    }
  }, "demo map \xB7 Tel Aviv area"));
}
window.MockMap = MockMap;
})(); } catch (e) { __ds_ns.__errors.push({ path: "MapClient.jsx", error: String((e && e.message) || e) }); }

// assets/CategoryIcons.jsx
try { (() => {
"use client";

/**
 * CategoryIcons — hand-drawn SVG line-art replacing Phosphor icons for
 * homepage category cards. Inspired by gardensweet.com and Graza — the
 * slightly loose strokes feel human and unique instead of generic.
 *
 * Each icon is rendered from a factory so color/size can be overridden
 * at the call-site (e.g. white on green hover, darker on cream bg).
 *
 * Keys match CATEGORY_CARDS[].key in app/page.js rather than category
 * names, because category names come from the DB and may drift.
 */
function Icon({
  children,
  size = 64,
  stroke = "#2e6853",
  strokeWidth = 1.5,
  className = ""
}) {
  return /*#__PURE__*/React.createElement("svg", {
    width: size,
    height: size,
    viewBox: "0 0 64 64",
    fill: "none",
    stroke: stroke,
    strokeWidth: strokeWidth,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    className: className,
    "aria-hidden": "true"
  }, children);
}

/* ---------- individual icons ---------- */

function MeatIcon(props) {
  // Steak cut with a bone poking out. Hand-drawn, asymmetrical curves.
  return /*#__PURE__*/React.createElement(Icon, props, /*#__PURE__*/React.createElement("path", {
    d: "M12 44 C12 44 8 36 14 28 C20 20 32 18 38 22 C44 26 46 34 42 40 C38 46 28 48 20 46 Z"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M38 22 L52 10"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "50",
    cy: "12",
    r: "4"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M20 38 C22 35 26 34 29 36"
  }));
}
function VegIcon(props) {
  // Leaf with a stem + two smaller side-leaves.
  return /*#__PURE__*/React.createElement(Icon, props, /*#__PURE__*/React.createElement("path", {
    d: "M32 52 L32 20"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M32 20 C32 20 18 16 14 28 C18 28 26 26 32 32"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M32 28 C32 28 44 20 50 30 C46 32 38 30 32 36"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M28 44 L20 50"
  }));
}
function DairyIcon(props) {
  // Milk bottle with a short neck and two spot details.
  return /*#__PURE__*/React.createElement(Icon, props, /*#__PURE__*/React.createElement("path", {
    d: "M24 16 L24 12 C24 10 26 8 28 8 L36 8 C38 8 40 10 40 12 L40 16"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M20 16 L20 52 C20 54 22 56 24 56 L40 56 C42 56 44 54 44 52 L44 16 Z"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M20 26 L44 26"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "30",
    cy: "38",
    r: "2"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "36",
    cy: "44",
    r: "2"
  }));
}
function BreadIcon(props) {
  // Round loaf with three steam curls rising.
  return /*#__PURE__*/React.createElement(Icon, props, /*#__PURE__*/React.createElement("path", {
    d: "M14 40 C14 40 12 32 18 26 C24 20 40 20 46 26 C52 32 50 40 50 40 Z"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M14 40 L14 48 C14 50 16 52 18 52 L46 52 C48 52 50 50 50 48 L50 40"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M24 20 C24 16 22 14 24 10"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M32 20 C32 14 30 12 32 8"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M40 20 C40 16 38 14 40 10"
  }));
}
function OilIcon(props) {
  // Jar with a lid and an olive/drop motif inside.
  return /*#__PURE__*/React.createElement(Icon, props, /*#__PURE__*/React.createElement("path", {
    d: "M22 24 L22 52 C22 54 24 56 26 56 L38 56 C40 56 42 54 42 52 L42 24 Z"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M20 24 L44 24"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M24 18 L40 18 C42 18 44 20 44 22 L44 24 L20 24 L20 22 C20 20 22 18 24 18 Z"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M28 36 C30 32 34 32 36 36 C38 40 36 46 32 46 C28 46 26 40 28 36 Z"
  }));
}
function SoapIcon(props) {
  // Soap dish with bubbles drifting up.
  return /*#__PURE__*/React.createElement(Icon, props, /*#__PURE__*/React.createElement("rect", {
    x: "18",
    y: "28",
    width: "28",
    height: "24",
    rx: "4"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M22 28 L22 22 C22 20 24 18 26 18 L38 18 C40 18 42 20 42 22 L42 28"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "26",
    cy: "16",
    r: "3"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "34",
    cy: "12",
    r: "2"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "40",
    cy: "15",
    r: "2.5"
  }));
}

/* ---------- key-based lookup for the homepage grid ---------- */

const CATEGORY_ICONS = {
  meat: MeatIcon,
  veg: VegIcon,
  dairy: DairyIcon,
  bread: BreadIcon,
  oil: OilIcon,
  care: SoapIcon
};
Object.assign(__ds_scope, { MeatIcon, VegIcon, DairyIcon, BreadIcon, OilIcon, SoapIcon, CATEGORY_ICONS });
})(); } catch (e) { __ds_ns.__errors.push({ path: "assets/CategoryIcons.jsx", error: String((e && e.message) || e) }); }

// chips-and-cards.jsx
try { (() => {
/* Filter chips — Booking.com style. Pill, horizontal scroll, #1C1A17 active */

function FilterChipsRow({
  filters,
  onToggle,
  onReset,
  activeCount
}) {
  const chipBase = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '8px 14px',
    borderRadius: 9999,
    fontFamily: 'var(--font-body)',
    fontWeight: 500,
    fontSize: 13,
    border: '1px solid var(--border)',
    background: '#fff',
    color: 'var(--fg)',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    transition: 'all 180ms var(--ease-out)',
    flexShrink: 0
  };
  const chipActive = {
    background: '#1C1A17',
    color: '#fff',
    borderColor: '#1C1A17'
  };
  const items = [{
    key: 'organic',
    label: '🌿 אורגני'
  }, {
    key: 'delivery',
    label: '🚚 משלוח'
  }, {
    key: 'verified',
    label: '✅ מאומת'
  }, ...FILTER_CATEGORIES.map(c => ({
    key: c,
    label: c,
    cat: true
  }))];
  return /*#__PURE__*/React.createElement("div", {
    style: {
      width: '100%'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8,
      overflowX: 'auto',
      scrollbarWidth: 'none',
      padding: '2px 0'
    },
    className: "hide-scrollbar"
  }, items.map(it => {
    const active = filters[it.key];
    const meta = it.cat ? CATEGORY_META[it.key] : null;
    return /*#__PURE__*/React.createElement("button", {
      key: it.key,
      onClick: () => onToggle(it.key),
      style: {
        ...chipBase,
        ...(active ? chipActive : {}),
        ...(active && meta ? {
          background: '#1C1A17'
        } : {})
      }
    }, it.cat && /*#__PURE__*/React.createElement("span", {
      style: {
        width: 8,
        height: 8,
        borderRadius: '50%',
        background: meta.color,
        display: 'inline-block'
      }
    }), it.label);
  })), activeCount > 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 10,
      padding: '0 2px'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      fontWeight: 500,
      color: 'var(--fg-muted)',
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      minWidth: 18,
      height: 18,
      padding: '0 5px',
      borderRadius: 9999,
      background: '#1C1A17',
      color: '#fff',
      fontSize: 11,
      fontWeight: 600
    }
  }, activeCount), "\u05E1\u05D9\u05E0\u05D5\u05E0\u05D9\u05DD \u05E4\u05E2\u05D9\u05DC\u05D9\u05DD"), /*#__PURE__*/React.createElement("button", {
    onClick: onReset,
    style: {
      background: 'none',
      border: 'none',
      padding: 0,
      fontSize: 12,
      color: 'var(--primary)',
      cursor: 'pointer',
      textDecoration: 'underline',
      textUnderlineOffset: 3,
      fontFamily: 'var(--font-body)'
    }
  }, "\u05D0\u05E4\u05E1\u05D9 \u05D0\u05EA \u05DB\u05DC \u05D4\u05E1\u05D9\u05E0\u05D5\u05E0\u05D9\u05DD")));
}

/* Condensed Zillow-style list card */

function WhatsAppMini({
  size = 16
}) {
  return /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 24 24",
    width: size,
    height: size,
    fill: "currentColor",
    "aria-hidden": "true"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M20.52 3.48A11.9 11.9 0 0012.04 0C5.45 0 .1 5.35.1 11.94c0 2.1.55 4.15 1.6 5.96L0 24l6.27-1.64a11.9 11.9 0 005.77 1.47h.01c6.59 0 11.94-5.35 11.94-11.94 0-3.19-1.24-6.19-3.47-8.41zM12.04 21.8a9.86 9.86 0 01-5.03-1.38l-.36-.21-3.72.97.99-3.62-.23-.37a9.84 9.84 0 01-1.51-5.25c0-5.45 4.44-9.88 9.9-9.88a9.87 9.87 0 017 2.89 9.83 9.83 0 012.9 7c-.01 5.45-4.45 9.85-9.94 9.85zm5.43-7.4c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15s-.77.97-.94 1.17c-.17.2-.35.22-.65.07-.3-.15-1.25-.46-2.38-1.47-.88-.78-1.47-1.75-1.65-2.04-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.07-.15-.67-1.61-.92-2.2-.24-.58-.49-.5-.67-.51l-.57-.01c-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.48 0 1.46 1.07 2.88 1.22 3.08.15.2 2.1 3.2 5.08 4.49.71.3 1.26.49 1.69.63.71.22 1.36.19 1.87.12.57-.09 1.76-.72 2-1.41.25-.7.25-1.29.17-1.41-.07-.12-.27-.2-.57-.34z"
  }));
}
function CondensedCard({
  p,
  active,
  onMouseEnter,
  onMouseLeave,
  onClick,
  cardRef
}) {
  const meta = CATEGORY_META[p.category];
  return /*#__PURE__*/React.createElement("article", {
    ref: cardRef,
    onMouseEnter: onMouseEnter,
    onMouseLeave: onMouseLeave,
    onClick: onClick,
    style: {
      display: 'flex',
      alignItems: 'stretch',
      gap: 12,
      padding: 10,
      background: active ? '#fff' : 'var(--bg-card, #fff)',
      border: active ? '2px solid var(--primary)' : '1px solid var(--border)',
      borderRadius: 12,
      cursor: 'pointer',
      transition: 'background 180ms var(--ease-out), border-color 180ms var(--ease-out)',
      position: 'relative'
    },
    onMouseOver: e => {
      if (!active) e.currentTarget.style.background = '#EAF3DE';
    },
    onMouseOut: e => {
      if (!active) e.currentTarget.style.background = '#fff';
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 64,
      height: 64,
      borderRadius: 8,
      overflow: 'hidden',
      flexShrink: 0,
      background: 'var(--light)',
      position: 'relative'
    }
  }, p.img ? /*#__PURE__*/React.createElement("img", {
    src: p.img,
    alt: p.name,
    style: {
      width: '100%',
      height: '100%',
      objectFit: 'cover'
    }
  }) : /*#__PURE__*/React.createElement("div", {
    style: {
      width: '100%',
      height: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: meta.color,
      fontSize: 22
    }
  }, "\u25CF"), /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      bottom: 4,
      insetInlineEnd: 4,
      width: 10,
      height: 10,
      borderRadius: '50%',
      background: meta.color,
      border: '1.5px solid #fff'
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0,
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center'
    }
  }, /*#__PURE__*/React.createElement("h3", {
    style: {
      fontFamily: 'var(--font-headline)',
      fontWeight: 700,
      fontSize: 16,
      color: 'var(--fg)',
      margin: 0,
      lineHeight: 1.2,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap'
    }
  }, p.name), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 12,
      color: 'var(--fg-muted)',
      margin: '3px 0 0',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap'
    }
  }, p.city, " \xB7 ", p.distance, p.verified && /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--primary)',
      marginInlineStart: 6
    }
  }, "\u2713")), /*#__PURE__*/React.createElement("p", {
    style: {
      fontFamily: "'Cormorant Garamond', serif",
      fontStyle: 'italic',
      fontWeight: 500,
      fontSize: 13,
      color: '#8B6914',
      margin: '4px 0 0'
    }
  }, p.price)), /*#__PURE__*/React.createElement("a", {
    href: "#",
    onClick: e => e.stopPropagation(),
    "aria-label": "WhatsApp",
    style: {
      alignSelf: 'center',
      width: 36,
      height: 36,
      borderRadius: '50%',
      background: 'var(--light)',
      color: 'var(--primary)',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      textDecoration: 'none',
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement(WhatsAppMini, {
    size: 16
  })));
}
Object.assign(window, {
  FilterChipsRow,
  CondensedCard,
  WhatsAppMini
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "chips-and-cards.jsx", error: String((e && e.message) || e) }); }

// data.js
try { (() => {
/* Mock producers — around Tel Aviv / Central Israel */

const PRODUCERS = [{
  id: 1,
  name: 'המאפייה של דנה',
  city: 'תל אביב',
  distance: '1.2 ק"מ',
  category: 'לחמים',
  lat: 32.0803,
  lng: 34.7807,
  price: 'מ-35₪',
  priceNum: 35,
  img: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=200&h=200&fit=crop',
  organic: true,
  delivery: false,
  verified: true,
  top: 'חלת שבת חמה'
}, {
  id: 2,
  name: 'חוות ירקות בשרון',
  city: 'רמת השרון',
  distance: '3.4 ק"מ',
  category: 'ירקות',
  lat: 32.1462,
  lng: 34.8430,
  price: 'מ-25₪',
  priceNum: 25,
  img: 'https://images.unsplash.com/photo-1518843875459-f738682238a6?w=200&h=200&fit=crop',
  organic: true,
  delivery: true,
  verified: true,
  top: 'סלסלת ירקות שבועית'
}, {
  id: 3,
  name: 'גבינות אהובה',
  city: 'רעננה',
  distance: '5.1 ק"מ',
  category: 'חלב',
  lat: 32.1847,
  lng: 34.8713,
  price: 'מ-48₪',
  priceNum: 48,
  img: 'https://images.unsplash.com/photo-1486297678162-eb2a19b0a32d?w=200&h=200&fit=crop',
  organic: false,
  delivery: true,
  verified: true,
  top: 'גבינת עיזים טרייה'
}, {
  id: 4,
  name: 'הקצב של יוסי',
  city: 'גבעתיים',
  distance: '2.8 ק"מ',
  category: 'בשר',
  lat: 32.0700,
  lng: 34.8106,
  price: 'מ-85₪',
  priceNum: 85,
  img: 'https://images.unsplash.com/photo-1607623814075-e51df1bdc82f?w=200&h=200&fit=crop',
  organic: false,
  delivery: false,
  verified: true,
  top: 'אנטריקוט גראס-פד'
}, {
  id: 5,
  name: 'שמן זית גליל',
  city: 'תל אביב',
  distance: '0.8 ק"מ',
  category: 'שמנים',
  lat: 32.0900,
  lng: 34.7750,
  price: 'מ-65₪',
  priceNum: 65,
  img: 'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=200&h=200&fit=crop',
  organic: true,
  delivery: true,
  verified: true,
  top: 'שמן זית כתית מעולה'
}, {
  id: 6,
  name: 'סבון טבעי של ספיר',
  city: 'הרצליה',
  distance: '7.2 ק"מ',
  category: 'טיפוח',
  lat: 32.1640,
  lng: 34.8430,
  price: 'מ-30₪',
  priceNum: 30,
  img: 'https://images.unsplash.com/photo-1600857544200-b2f666a9a2ec?w=200&h=200&fit=crop',
  organic: true,
  delivery: true,
  verified: false,
  top: 'סבון לבנדר מקומי'
}, {
  id: 7,
  name: 'לחמניות של רוני',
  city: 'רמת גן',
  distance: '4.0 ק"מ',
  category: 'לחמים',
  lat: 32.0680,
  lng: 34.8240,
  price: 'מ-18₪',
  priceNum: 18,
  img: 'https://images.unsplash.com/photo-1608198093002-ad4e005484ec?w=200&h=200&fit=crop',
  organic: false,
  delivery: false,
  verified: true,
  top: 'פוקאצ׳ה זיתים'
}, {
  id: 8,
  name: 'חלב כבשים מגליל',
  city: 'תל אביב',
  distance: '1.5 ק"מ',
  category: 'חלב',
  lat: 32.0750,
  lng: 34.7880,
  price: 'מ-42₪',
  priceNum: 42,
  img: 'https://images.unsplash.com/photo-1628088062854-d1870b4553da?w=200&h=200&fit=crop',
  organic: true,
  delivery: false,
  verified: true,
  top: 'יוגורט כבשים'
}, {
  id: 9,
  name: 'ירקות אורגניים מעמק',
  city: 'תל אביב',
  distance: '2.1 ק"מ',
  category: 'ירקות',
  lat: 32.0650,
  lng: 34.7770,
  price: 'מ-30₪',
  priceNum: 30,
  img: 'https://images.unsplash.com/photo-1566385101042-1a0aa0c1268c?w=200&h=200&fit=crop',
  organic: true,
  delivery: true,
  verified: true,
  top: 'ארגז עונתי'
}, {
  id: 10,
  name: 'בשר טרי מהגולן',
  city: 'תל אביב',
  distance: '3.0 ק"מ',
  category: 'בשר',
  lat: 32.0870,
  lng: 34.7920,
  price: 'מ-90₪',
  priceNum: 90,
  img: 'https://images.unsplash.com/photo-1558030006-450675393462?w=200&h=200&fit=crop',
  organic: false,
  delivery: true,
  verified: false,
  top: 'שייטל בקר'
}, {
  id: 11,
  name: 'שמן חמניות כפרי',
  city: 'ראש העין',
  distance: '9.8 ק"מ',
  category: 'שמנים',
  lat: 32.0830,
  lng: 34.9520,
  price: 'מ-55₪',
  priceNum: 55,
  img: 'https://images.unsplash.com/photo-1556269234-99c96c9b9e6f?w=200&h=200&fit=crop',
  organic: true,
  delivery: false,
  verified: true,
  top: 'שמן קנולה'
}, {
  id: 12,
  name: 'קרמים של יעל',
  city: 'כפר סבא',
  distance: '6.5 ק"מ',
  category: 'טיפוח',
  lat: 32.1750,
  lng: 34.9080,
  price: 'מ-45₪',
  priceNum: 45,
  img: 'https://images.unsplash.com/photo-1608571423902-eed4a5ad8108?w=200&h=200&fit=crop',
  organic: true,
  delivery: true,
  verified: true,
  top: 'קרם לחות כלנית'
}];
const FILTER_CATEGORIES = ['בשר', 'ירקות', 'חלב', 'לחמים', 'שמנים', 'טיפוח'];
const CITIES = ['תל אביב', 'ירושלים', 'חיפה', 'באר שבע', 'רמת גן', 'הרצליה', 'רעננה'];
window.PRODUCERS = PRODUCERS;
window.FILTER_CATEGORIES = FILTER_CATEGORIES;
window.CITIES = CITIES;
})(); } catch (e) { __ds_ns.__errors.push({ path: "data.js", error: String((e && e.message) || e) }); }

// frontend/components/MapComponent.jsx
try { (() => {
"use client";

const {
  useEffect,
  useRef
} = React;
/**
 * MapComponent — raw-Leaflet map with custom category-colored markers
 * and clustering. Covers docs/archive/MAP_IMPROVEMENTS.md items #4, #5, #6, #10.
 *
 * v3 (MAP_IMPROVEMENTS.md): emoji in markers replaced with Phosphor
 * line-art icons (FishSimple / Plant / Cheese / Bread / JarLabel /
 * FlowerTulip), weight="fill", white on the category-colored circle.
 * Marker sizes shrunk to 28/36px so a dense cluster doesn't hide the
 * map tiles underneath.
 *
 * Clustering: uses vanilla `leaflet.markercluster` (not
 * react-leaflet-cluster) because this component drives Leaflet
 * directly without react-leaflet.
 *
 * Parent communicates via `registerApi` callback (not refs — next/dynamic
 * doesn't reliably forward refs).
 */

/**
 * Render a Phosphor icon component to an SVG string for use inside a
 * Leaflet divIcon. `renderToStaticMarkup` is the React-DOM primitive
 * for one-shot server-style rendering — no hydration, no root, no
 * wasted DOM nodes. White fill + weight="fill" on the category color.
 */
function iconSvgMarkup(IconComponent, size) {
  return renderToStaticMarkup(/*#__PURE__*/React.createElement(IconComponent, {
    size: size,
    weight: "fill",
    color: "#ffffff"
  }));
}

/** Create a category divIcon — circle, category color bg, white filled icon. */
function createCategoryMarker(producer, {
  active = false,
  hovered = false
} = {}) {
  const {
    color,
    icon: IconComponent
  } = styleForProducer(producer);
  // v3 sizes: 28px default / 36px selected. Hover lifts slightly but
  // stays under the selected size so "selected" always reads as the
  // tallest pin on the map.
  const size = active ? 36 : hovered ? 32 : 28;
  const iconSize = 14; // constant inner glyph size — visual rhythm

  const svg = iconSvgMarkup(IconComponent, iconSize);
  const html = `
    <div class="mehamakor-marker ${active ? "active" : ""} ${hovered ? "hovered" : ""}"
         style="
           background: ${color};
           border: 2px solid #ffffff;
           border-radius: 50%;
           width: ${size}px;
           height: ${size}px;
           display: flex; align-items: center; justify-content: center;
           box-shadow: 0 2px 8px rgba(0,0,0,0.2);
           transition: all 0.18s ease-out;
           ${active ? "box-shadow: 0 4px 14px rgba(0,0,0,0.28), 0 0 0 4px rgba(46,104,83,0.18);" : ""}
         ">
      ${svg}
    </div>
  `;
  return L.divIcon({
    html,
    className: "mehamakor-marker-wrap",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2]
  });
}
const escapeHtml = str => {
  if (str == null) return "";
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
};

/** docs/archive/MAP_IMPROVEMENTS.md #6 — rich popup with photo, rating, and CTAs. */
function buildPopupHtml(producer) {
  const href = producer.slug ? `/${producer.slug}` : `/producer/${producer.id}`;
  const photo = producer.images?.[0];
  const cat = producer.categories?.[0];
  const phone = normalizePhone(producer.phone) || null;
  const waUrl = phone ? `https://wa.me/${phone}?text=${encodeURIComponent(`היי! מצאתי אותך במהמקור — ${producer.name || ""}`)}` : null;
  return `
    <div style="text-align:right;font-family:'DM Sans',Heebo,sans-serif;min-width:240px;max-width:260px;direction:rtl;">
      ${photo ? `<img src="${escapeHtml(photo)}" alt="${escapeHtml(producer.name || "")}"
                 style="width:100%;height:120px;object-fit:cover;border-radius:8px;margin-bottom:10px;" />` : ""}
      <div style="font-family:'Frank Ruhl Libre',serif;font-weight:700;font-size:16px;color:#1C1A17;line-height:1.2;">
        ${escapeHtml(producer.name || "עסק")}
      </div>
      <div style="color:#6B6B6B;font-size:12px;margin-top:3px;">
        ${escapeHtml(producer.city || "")}${cat ? ` · ${escapeHtml(cat.name || "")}` : ""}
      </div>
      ${producer.reviews_count > 0 ? `<div style="color:#8B6914;font-size:12px;margin-top:5px;">
               ⭐ ${Number(producer.avg_rating).toFixed(1)} (${producer.reviews_count})
             </div>` : ""}
      <div style="display:flex;gap:6px;margin-top:10px;">
        <a href="${escapeHtml(href)}"
           style="flex:1;background:#2e6853;color:#fff;padding:8px;border-radius:6px;
                  text-align:center;text-decoration:none;font-size:13px;font-weight:500;">
          פרטים מלאים
        </a>
        ${waUrl ? `<a href="${escapeHtml(waUrl)}" target="_blank" rel="noopener noreferrer"
                 aria-label="שלח הודעת ווטסאפ"
                 style="background:#25D366;color:#fff;padding:8px 12px;border-radius:6px;
                        text-decoration:none;font-size:16px;line-height:1;">
                 <svg viewBox="0 0 24 24" width="16" height="16" fill="white" aria-hidden="true"><path d="M20.52 3.48A11.9 11.9 0 0012.04 0C5.45 0 .1 5.35.1 11.94c0 2.1.55 4.15 1.6 5.96L0 24l6.27-1.64a11.9 11.9 0 005.77 1.47h.01c6.59 0 11.94-5.35 11.94-11.94 0-3.19-1.24-6.19-3.47-8.41zM12.04 21.8a9.86 9.86 0 01-5.03-1.38l-.36-.21-3.72.97.99-3.62-.23-.37a9.84 9.84 0 01-1.51-5.25c0-5.45 4.44-9.88 9.9-9.88a9.87 9.87 0 017 2.89 9.83 9.83 0 012.9 7c-.01 5.45-4.45 9.85-9.94 9.85zm5.43-7.4c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15s-.77.97-.94 1.17c-.17.2-.35.22-.65.07-.3-.15-1.25-.46-2.38-1.47-.88-.78-1.47-1.75-1.65-2.04-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.07-.15-.67-1.61-.92-2.2-.24-.58-.49-.5-.67-.51l-.57-.01c-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.48 0 1.46 1.07 2.88 1.22 3.08.15.2 2.1 3.2 5.08 4.49.71.3 1.26.49 1.69.63.71.22 1.36.19 1.87.12.57-.09 1.76-.72 2-1.41.25-.7.25-1.29.17-1.41-.07-.12-.27-.2-.57-.34z"/></svg>
               </a>` : ""}
      </div>
    </div>
  `;
}
function MapComponent({
  producers = [],
  onProducerClick,
  onProducerHover,
  onBoundsChange,
  onMapMove,
  registerApi
}) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const clusterGroupRef = useRef(null);
  const markersRef = useRef(new Map());
  const hoveredIdRef = useRef(null);
  const activeIdRef = useRef(null);
  const myLocationMarkerRef = useRef(null);
  const hasFitBoundsRef = useRef(false);
  const programmaticMoveRef = useRef(false);
  const onBoundsChangeRef = useRef(onBoundsChange);
  onBoundsChangeRef.current = onBoundsChange;
  const onProducerClickRef = useRef(onProducerClick);
  onProducerClickRef.current = onProducerClick;
  const onProducerHoverRef = useRef(onProducerHover);
  onProducerHoverRef.current = onProducerHover;
  const onMapMoveRef = useRef(onMapMove);
  onMapMoveRef.current = onMapMove;
  const refreshMarkerIcon = id => {
    const entry = markersRef.current.get(id);
    if (!entry) return;
    entry.marker.setIcon(createCategoryMarker(entry.producer, {
      active: activeIdRef.current === id,
      hovered: hoveredIdRef.current === id
    }));
  };
  useEffect(() => {
    if (!registerApi) return;
    const api = {
      focusProducer: producerId => {
        const entry = markersRef.current.get(producerId);
        if (!entry || !mapInstanceRef.current) return;
        const prev = activeIdRef.current;
        activeIdRef.current = producerId;
        if (prev) refreshMarkerIcon(prev);
        refreshMarkerIcon(producerId);
        const latlng = entry.marker.getLatLng();
        programmaticMoveRef.current = true;
        mapInstanceRef.current.flyTo(latlng, 14, {
          duration: 1.2
        });
        mapInstanceRef.current.once("moveend", () => {
          entry.marker.openPopup();
        });
      },
      setHoveredProducer: producerId => {
        const prev = hoveredIdRef.current;
        if (prev === producerId) return;
        hoveredIdRef.current = producerId;
        if (prev) refreshMarkerIcon(prev);
        if (producerId) refreshMarkerIcon(producerId);
      },
      getMap: () => mapInstanceRef.current
    };
    registerApi(api);
    return () => registerApi(null);
  }, [registerApi]);
  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;
    mapInstanceRef.current = L.map(mapRef.current, {
      zoomControl: true
    }).setView([31.5, 34.8], 8);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(mapInstanceRef.current);
    clusterGroupRef.current = L.markerClusterGroup({
      chunkedLoading: true,
      showCoverageOnHover: false,
      maxClusterRadius: 60,
      iconCreateFunction: cluster => {
        const count = cluster.getChildCount();
        return L.divIcon({
          html: `
            <div style="
              background:#F5F0E8;color:#2e6853;border-radius:50%;
              width:42px;height:42px;display:flex;align-items:center;
              justify-content:center;font-family:'Frank Ruhl Libre',serif;
              font-size:16px;font-weight:700;border:2px solid #2e6853;
              box-shadow:0 2px 10px rgba(0,0,0,0.18);
            ">${count}</div>`,
          className: "mehamakor-cluster",
          iconSize: [42, 42]
        });
      }
    });
    mapInstanceRef.current.addLayer(clusterGroupRef.current);
    const fireBounds = () => {
      if (!mapInstanceRef.current) return;
      const b = mapInstanceRef.current.getBounds();
      onBoundsChangeRef.current?.({
        north: b.getNorth(),
        south: b.getSouth(),
        east: b.getEast(),
        west: b.getWest()
      });
    };
    mapInstanceRef.current.whenReady(fireBounds);
    mapInstanceRef.current.on("moveend", () => {
      fireBounds();
      if (programmaticMoveRef.current) {
        programmaticMoveRef.current = false;
        return;
      }
      onMapMoveRef.current?.();
    });
    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        clusterGroupRef.current = null;
        myLocationMarkerRef.current = null;
        hasFitBoundsRef.current = false;
      }
    };
  }, []);
  useEffect(() => {
    if (!mapInstanceRef.current || !clusterGroupRef.current) return;
    clusterGroupRef.current.clearLayers();
    markersRef.current = new Map();
    if (!Array.isArray(producers) || producers.length === 0) return;
    producers.forEach(p => {
      if (!p || typeof p.lat !== "number" || typeof p.lng !== "number") return;
      if (!p.id) return;
      const marker = L.marker([p.lat, p.lng], {
        icon: createCategoryMarker(p, {
          active: false,
          hovered: false
        }),
        alt: p.name || "עסק",
        title: "",
        keyboard: true
      });
      marker.bindTooltip(p.name || "עסק", {
        direction: "top",
        offset: [0, -20],
        permanent: false,
        className: "mehamakor-tooltip"
      });
      marker.bindPopup(buildPopupHtml(p), {
        maxWidth: 280,
        closeButton: true,
        autoPan: true
      });
      marker.on("click", () => onProducerClickRef.current?.(p));
      marker.on("mouseover", () => onProducerHoverRef.current?.(p.id));
      marker.on("mouseout", () => onProducerHoverRef.current?.(null));
      clusterGroupRef.current.addLayer(marker);
      markersRef.current.set(p.id, {
        marker,
        producer: p
      });
    });
    if (!hasFitBoundsRef.current && markersRef.current.size > 0) {
      const latlngs = Array.from(markersRef.current.values()).map(entry => entry.marker.getLatLng());
      const bounds = L.latLngBounds(latlngs);
      if (bounds.isValid()) {
        programmaticMoveRef.current = true;
        mapInstanceRef.current.fitBounds(bounds, {
          padding: [40, 40],
          maxZoom: 12
        });
      }
      hasFitBoundsRef.current = true;
    }
  }, [producers]);
  const goToMyLocation = () => {
    if (!mapInstanceRef.current || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(pos => {
      const {
        latitude,
        longitude
      } = pos.coords;
      const latlng = [latitude, longitude];
      programmaticMoveRef.current = true;
      mapInstanceRef.current.flyTo(latlng, 13, {
        duration: 1.2
      });
      if (myLocationMarkerRef.current) {
        myLocationMarkerRef.current.setLatLng(latlng);
      } else {
        myLocationMarkerRef.current = L.circleMarker(latlng, {
          radius: 8,
          color: "#2e6853",
          fillColor: "#2e6853",
          fillOpacity: 0.85,
          weight: 2,
          interactive: true
        }).addTo(mapInstanceRef.current).bindPopup("המיקום שלי");
      }
      myLocationMarkerRef.current.openPopup();
    }, () => alert("לא הצלחנו לקבל את המיקום שלך"));
  };
  return /*#__PURE__*/React.createElement("div", {
    className: "relative"
  }, /*#__PURE__*/React.createElement("div", {
    ref: mapRef,
    className: "w-full h-full min-h-[500px] rounded-[16px]"
  }), /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: goToMyLocation,
    className: "absolute bottom-6 left-4 z-[1000] bg-white rounded-[10px] px-3 py-2 shadow-md hover:bg-light transition text-sm flex items-center gap-2 border border-border focus-visible:ring-2 focus-visible:ring-primary/40",
    title: "\u05E7\u05E8\u05D5\u05D1 \u05D0\u05DC\u05D9",
    "aria-label": "\u05DE\u05E8\u05DB\u05D6 \u05DE\u05E4\u05D4 \u05E2\u05DC \u05D4\u05DE\u05D9\u05E7\u05D5\u05DD \u05E9\u05DC\u05D9"
  }, /*#__PURE__*/React.createElement(Crosshair, {
    size: 16,
    weight: "duotone",
    className: "text-primary",
    "aria-hidden": "true"
  }), "\u05E7\u05E8\u05D5\u05D1 \u05D0\u05DC\u05D9"));
}
Object.assign(__ds_scope, { MapComponent });
})(); } catch (e) { __ds_ns.__errors.push({ path: "frontend/components/MapComponent.jsx", error: String((e && e.message) || e) }); }

// frontend/lib/map-categories.js
try { (() => {
/**
 * Shared category styling for the map page — single source of truth.
 *
 * Previously duplicated between `components/MapComponent.jsx` and
 * `app/map/MapClient.jsx` because MapComponent is dynamically imported
 * with ssr:false, so its exports aren't available at server render time
 * in MapClient. Extracting here lets both import safely.
 *
 * Keys match `category.name` values from the DB. Add entries alongside
 * any new category rows in the backend.
 *
 * `icon` is the Phosphor component name (kept as a string so this module
 * stays server-safe); MapComponent resolves it to the real React icon
 * at render time. Icons render white + weight="fill" on the colored
 * circle background. See docs/archive/MAP_IMPROVEMENTS.md v3 for the
 * emoji → line-art migration rationale.
 */

const CATEGORY_STYLES = {
  "בשר, עוף ודגים": {
    color: "#c04040",
    icon: FishSimple,
    iconName: "FishSimple"
  },
  "ירקות, פירות ומשקים": {
    color: "#2e6853",
    icon: Plant,
    iconName: "Plant"
  },
  "חלב וגבינות": {
    color: "#4a90d9",
    icon: Cheese,
    iconName: "Cheese"
  },
  "לחמים ואפייה": {
    color: "#8B6914",
    icon: Bread,
    iconName: "Bread"
  },
  "שמנים ודבש": {
    color: "#e8a020",
    icon: JarLabel,
    iconName: "JarLabel"
  },
  "טיפוח וסבונים": {
    color: "#9b59b6",
    icon: FlowerTulip,
    iconName: "FlowerTulip"
  }
};
const DEFAULT_CATEGORY_STYLE = {
  color: "#2e6853",
  icon: Leaf,
  iconName: "Leaf"
};

/**
 * Array form — used by the legend widget on the map page. Order is
 * the visual display order in the sidebar.
 */
const CATEGORY_LEGEND = Object.entries(CATEGORY_STYLES).map(([name, {
  color,
  icon,
  iconName
}]) => ({
  name,
  color,
  icon,
  iconName
}));

/** Resolve the style for a producer from its first category. */
function styleForProducer(producer) {
  const firstCategory = producer?.categories?.[0]?.name;
  return firstCategory && CATEGORY_STYLES[firstCategory] || DEFAULT_CATEGORY_STYLE;
}
Object.assign(__ds_scope, { CATEGORY_STYLES, DEFAULT_CATEGORY_STYLE, CATEGORY_LEGEND, styleForProducer });
})(); } catch (e) { __ds_ns.__errors.push({ path: "frontend/lib/map-categories.js", error: String((e && e.message) || e) }); }

// homepage/parts/BusinessAndFooter.jsx
try { (() => {
// Section 8 — Business CTA + Footer.
function BusinessCTA() {
  return /*#__PURE__*/React.createElement("section", {
    style: {
      background: 'var(--primary-dark)',
      color: '#fff',
      padding: '96px 24px',
      position: 'relative',
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("div", {
    "aria-hidden": "true",
    style: {
      position: 'absolute',
      insetInlineEnd: -40,
      top: -40,
      color: 'rgba(255,255,255,0.08)',
      transform: 'rotate(12deg)',
      pointerEvents: 'none'
    }
  }, /*#__PURE__*/React.createElement(OliveBranch, {
    size: 400,
    strokeWidth: 1.1
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 700,
      margin: '0 auto',
      textAlign: 'center',
      position: 'relative'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-body)',
      fontWeight: 500,
      fontSize: 11,
      letterSpacing: '0.15em',
      textTransform: 'uppercase',
      color: '#EAF3DE',
      marginBottom: 16
    }
  }, "\u05DC\u05D1\u05EA\u05D9 \u05E2\u05E1\u05E7"), /*#__PURE__*/React.createElement("h2", {
    style: {
      fontFamily: 'var(--font-headline)',
      fontWeight: 900,
      fontSize: 'clamp(36px, 5.5vw, 68px)',
      lineHeight: 1,
      letterSpacing: '-0.02em',
      margin: '0 0 20px',
      color: '#fff'
    }
  }, "\u05D9\u05E9 \u05DC\u05DA \u05D1\u05D9\u05EA \u05E2\u05E1\u05E7?", /*#__PURE__*/React.createElement("br", null), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-english)',
      fontStyle: 'italic',
      fontWeight: 600,
      color: '#EAF3DE'
    }
  }, "\u05D1\u05D5\u05D0\u05D9 \u05D0\u05DC\u05D9\u05E0\u05D5.")), /*#__PURE__*/React.createElement("p", {
    style: {
      fontFamily: 'var(--font-body)',
      fontWeight: 400,
      fontSize: 18,
      lineHeight: 1.6,
      color: 'rgba(234,243,222,0.9)',
      maxWidth: 520,
      margin: '0 auto 32px'
    }
  }, "\u05D7\u05D9\u05E0\u05DD, \u05DC\u05EA\u05DE\u05D9\u05D3. \u05D1\u05DC\u05D9 \u05E2\u05DE\u05DC\u05D5\u05EA, \u05D1\u05DC\u05D9 \u05DE\u05EA\u05D5\u05D5\u05DB\u05D9\u05DD. \u05D0\u05EA \u05DE\u05D3\u05D1\u05E8\u05EA \u05D9\u05E9\u05E8 \u05E2\u05DD \u05D4\u05DC\u05E7\u05D5\u05D7\u05D5\u05EA \u05D1\u05D5\u05D5\u05D0\u05D8\u05E1\u05D0\u05E4 \u2014 \u05D0\u05E0\u05D7\u05E0\u05D5 \u05E8\u05E7 \u05D3\u05D5\u05D0\u05D2\u05D5\u05EA \u05E9\u05D9\u05DE\u05E6\u05D0\u05D5 \u05D0\u05D5\u05EA\u05DA."), /*#__PURE__*/React.createElement("a", {
    href: "#register",
    style: {
      display: 'inline-block',
      background: 'var(--background)',
      color: 'var(--primary-dark)',
      border: 'none',
      padding: '16px 32px',
      borderRadius: 'var(--radius-md)',
      fontSize: 16,
      fontWeight: 600,
      textDecoration: 'none',
      minHeight: 52,
      fontFamily: 'var(--font-body)'
    }
  }, "\u05D4\u05D5\u05E1\u05D9\u05E4\u05D9 \u05D0\u05EA \u05D4\u05E2\u05E1\u05E7 \u05E9\u05DC\u05DA"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'center',
      gap: 32,
      marginTop: 40,
      flexWrap: 'wrap',
      fontSize: 14,
      color: 'rgba(234,243,222,0.85)',
      fontFamily: 'var(--font-body)'
    }
  }, /*#__PURE__*/React.createElement("span", null, "\u2713 \u05D7\u05D9\u05E0\u05DD \u05DC\u05D1\u05EA\u05D9 \u05E2\u05E1\u05E7"), /*#__PURE__*/React.createElement("span", null, "\u2713 \u05DC\u05DC\u05D0 \u05E2\u05DE\u05DC\u05D5\u05EA"), /*#__PURE__*/React.createElement("span", null, "\u2713 WhatsApp \u05D9\u05E9\u05D9\u05E8"))));
}
function Footer() {
  return /*#__PURE__*/React.createElement("footer", {
    style: {
      background: 'var(--primary-dark)',
      color: '#EAF3DE',
      padding: '80px 24px 24px',
      borderTop: '1px solid rgba(255,255,255,0.08)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 'var(--container-max)',
      margin: '0 auto'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 16,
      paddingBottom: 48,
      borderBottom: '1px solid rgba(255,255,255,0.1)',
      textAlign: 'center'
    }
  }, /*#__PURE__*/React.createElement("h2", {
    style: {
      fontFamily: 'var(--font-headline)',
      fontWeight: 900,
      fontSize: 'clamp(56px, 10vw, 120px)',
      lineHeight: 0.9,
      letterSpacing: '-0.03em',
      margin: 0,
      color: '#fff'
    }
  }, "\u05DE\u05D4\u05DE\u05E7\u05D5\u05E8"), /*#__PURE__*/React.createElement("p", {
    style: {
      fontFamily: 'var(--font-headline)',
      fontStyle: 'italic',
      fontWeight: 400,
      fontSize: 22,
      color: 'rgba(234,243,222,0.9)',
      margin: 0
    }
  }, "\u05D0\u05D5\u05DB\u05DC \u05D0\u05DE\u05D9\u05EA\u05D9, \u05DE\u05D0\u05E0\u05E9\u05D9\u05DD \u05D0\u05DE\u05D9\u05EA\u05D9\u05D9\u05DD.")), /*#__PURE__*/React.createElement("div", {
    className: "footer-grid",
    style: {
      display: 'grid',
      gridTemplateColumns: '1.5fr 1fr 1fr 1fr 1.2fr',
      gap: 40,
      padding: '48px 0',
      borderBottom: '1px solid rgba(255,255,255,0.1)'
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("p", {
    style: {
      fontFamily: 'var(--font-body)',
      fontWeight: 400,
      fontSize: 14,
      lineHeight: 1.7,
      color: 'rgba(234,243,222,0.85)',
      margin: '0 0 16px',
      maxWidth: 280
    }
  }, "\u05E4\u05DC\u05D8\u05E4\u05D5\u05E8\u05DE\u05D4 \u05E9\u05DE\u05D7\u05D1\u05E8\u05EA \u05D1\u05D9\u05DF \u05DE\u05D2\u05D3\u05DC\u05D9\u05DD \u05E7\u05D8\u05E0\u05D9\u05DD, \u05D0\u05D5\u05E4\u05D5\u05EA \u05D5\u05E9\u05DB\u05E0\u05D5\u05EA \u2014 \u05D9\u05E9\u05E8 \u05D0\u05DC\u05D9\u05D9\u05DA."), /*#__PURE__*/React.createElement("a", {
    href: "https://www.instagram.com/meha_makor",
    style: {
      color: '#EAF3DE',
      textDecoration: 'none',
      fontSize: 14,
      display: 'inline-flex',
      alignItems: 'center',
      gap: 8,
      fontFamily: 'var(--font-body)'
    }
  }, /*#__PURE__*/React.createElement(IconInstagram, {
    size: 18
  }), " @meha_makor")), [{
    t: 'לגלות',
    links: ['דף הבית', 'מפה', 'כל בתי העסק', 'חדשים']
  }, {
    t: 'קהילה',
    links: ['אירועים', 'מהמטבח של השכן', 'אודות']
  }, {
    t: 'בתי עסק',
    links: ['הוסיפי עסק', 'כניסה', 'ניהול העסק']
  }].map(col => /*#__PURE__*/React.createElement("div", {
    key: col.t
  }, /*#__PURE__*/React.createElement("h3", {
    style: {
      fontFamily: 'var(--font-headline)',
      fontWeight: 700,
      fontSize: 16,
      margin: '0 0 16px',
      color: '#fff'
    }
  }, col.t), /*#__PURE__*/React.createElement("ul", {
    style: {
      listStyle: 'none',
      padding: 0,
      margin: 0,
      display: 'flex',
      flexDirection: 'column',
      gap: 10
    }
  }, col.links.map(l => /*#__PURE__*/React.createElement("li", {
    key: l
  }, /*#__PURE__*/React.createElement("a", {
    href: "#",
    style: {
      fontFamily: 'var(--font-body)',
      fontSize: 14,
      color: 'rgba(234,243,222,0.85)',
      textDecoration: 'none'
    }
  }, l)))))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h3", {
    style: {
      fontFamily: 'var(--font-headline)',
      fontWeight: 700,
      fontSize: 16,
      margin: '0 0 12px',
      color: '#fff'
    }
  }, "\u05E0\u05D9\u05D5\u05D6\u05DC\u05D8\u05E8 \u05E9\u05D1\u05D5\u05E2\u05D9"), /*#__PURE__*/React.createElement("p", {
    style: {
      fontFamily: 'var(--font-body)',
      fontSize: 13,
      lineHeight: 1.6,
      color: 'rgba(234,243,222,0.85)',
      margin: '0 0 16px'
    }
  }, "\u05D1\u05D9\u05EA \u05E2\u05E1\u05E7 \u05D7\u05D3\u05E9, \u05DE\u05EA\u05DB\u05D5\u05DF \u05E2\u05D5\u05E0\u05EA\u05D9, \u05E9\u05D9\u05D7\u05D4 \u05E2\u05DD \u05E9\u05DB\u05E0\u05D4. \u05E4\u05E2\u05DD \u05D1\u05E9\u05D1\u05D5\u05E2."), /*#__PURE__*/React.createElement("form", {
    onSubmit: e => e.preventDefault(),
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("input", {
    type: "email",
    dir: "ltr",
    placeholder: "your@email.com",
    style: {
      background: 'transparent',
      border: '1px solid rgba(255,255,255,0.3)',
      color: '#fff',
      padding: '12px 14px',
      borderRadius: 'var(--radius-sm)',
      outline: 'none',
      fontSize: 14,
      fontFamily: 'var(--font-body)'
    }
  }), /*#__PURE__*/React.createElement("button", {
    type: "submit",
    style: {
      background: 'var(--background)',
      color: 'var(--primary-dark)',
      border: 'none',
      padding: '12px 20px',
      borderRadius: 'var(--radius-sm)',
      fontWeight: 600,
      cursor: 'pointer',
      fontSize: 14,
      fontFamily: 'var(--font-body)'
    }
  }, "\u05D4\u05E8\u05E9\u05DE\u05D4")))), /*#__PURE__*/React.createElement("div", {
    style: {
      paddingTop: 24,
      display: 'flex',
      justifyContent: 'space-between',
      fontSize: 12,
      color: 'rgba(234,243,222,0.6)',
      flexWrap: 'wrap',
      gap: 12,
      fontFamily: 'var(--font-body)'
    }
  }, /*#__PURE__*/React.createElement("span", null, "\xA9 2026 \u05DE\u05D4\u05DE\u05E7\u05D5\u05E8 \xB7 \u05EA\u05E0\u05D0\u05D9\u05DD \xB7 \u05E4\u05E8\u05D8\u05D9\u05D5\u05EA \xB7 \u05E0\u05D2\u05D9\u05E9\u05D5\u05EA"), /*#__PURE__*/React.createElement("span", null, "\u05E2\u05E9\u05D5\u05D9 \u05D1\u05D0\u05D4\u05D1\u05D4 \u05D1\u05D9\u05E9\u05E8\u05D0\u05DC"))), /*#__PURE__*/React.createElement("style", null, `
        @media (max-width: 820px) {
          .footer-grid { grid-template-columns: 1fr 1fr !important; gap: 32px !important; }
        }
        @media (max-width: 520px) {
          .footer-grid { grid-template-columns: 1fr !important; }
        }
      `));
}
window.BusinessCTA = BusinessCTA;
window.Footer = Footer;
})(); } catch (e) { __ds_ns.__errors.push({ path: "homepage/parts/BusinessAndFooter.jsx", error: String((e && e.message) || e) }); }

// homepage/parts/CategoryGrid.jsx
try { (() => {
const CATEGORY_LIST = [{
  key: 'veg',
  name: 'ירקות, פירות ומשקים',
  img: 'https://images.unsplash.com/photo-1540420773420-3366772f4999?w=900&auto=format&q=80',
  span: 2
}, {
  key: 'bread',
  name: 'לחמים ואפייה',
  img: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=600&auto=format&q=80'
}, {
  key: 'dairy',
  name: 'חלב וגבינות',
  img: 'https://images.unsplash.com/photo-1771578742735-36009188c207?w=600&auto=format&q=80'
}, {
  key: 'oil',
  name: 'שמנים ודבש',
  img: 'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=600&auto=format&q=80'
}, {
  key: 'meat',
  name: 'בשר, עוף ודגים',
  img: 'https://images.unsplash.com/photo-1607623814075-e51df1bdc82f?w=600&auto=format&q=80'
}, {
  key: 'care',
  name: 'טיפוח וסבונים',
  img: 'https://images.unsplash.com/photo-1600857544200-b2f666a9a2ec?w=600&auto=format&q=80'
}];
function CategoryGrid({
  onClick
}) {
  return /*#__PURE__*/React.createElement("section", {
    style: {
      maxWidth: 'var(--container-max)',
      margin: '0 auto',
      padding: '40px 16px 80px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'end',
      justifyContent: 'space-between',
      marginBottom: 32,
      gap: 24,
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "eyebrow",
    style: {
      color: 'var(--accent)',
      marginBottom: 10
    }
  }, "BY CATEGORY \xB7 \u05D2\u05DC\u05D9 \u05DC\u05E4\u05D9"), /*#__PURE__*/React.createElement("h2", {
    style: {
      fontFamily: 'var(--font-headline)',
      fontWeight: 700,
      fontSize: 'clamp(32px, 4vw, 52px)',
      lineHeight: 1.05,
      margin: 0,
      color: 'var(--fg)'
    }
  }, "\u05DB\u05DC \u05D4\u05E7\u05D8\u05D2\u05D5\u05E8\u05D9\u05D5\u05EA,", /*#__PURE__*/React.createElement("br", null), "\u05D1\u05DC\u05D9 \u05DE\u05EA\u05D5\u05D5\u05DB\u05D9\u05DD.")), /*#__PURE__*/React.createElement("a", {
    href: "#",
    style: {
      color: 'var(--primary)',
      fontSize: 14,
      textDecoration: 'none'
    }
  }, "\u05E8\u05D0\u05D9 \u05D4\u05DB\u05DC \u2190")), /*#__PURE__*/React.createElement("div", {
    className: "cat-grid",
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(3, 1fr)',
      gridAutoRows: '260px',
      gap: 16
    }
  }, CATEGORY_LIST.map((c, i) => /*#__PURE__*/React.createElement("button", {
    key: c.key,
    onClick: () => onClick?.(c),
    style: {
      gridColumn: c.span === 2 ? 'span 2' : 'span 1',
      position: 'relative',
      border: 'none',
      padding: 0,
      cursor: 'pointer',
      borderRadius: 'var(--radius-md)',
      overflow: 'hidden',
      textAlign: 'start',
      background: `url(${c.img}) center/cover`
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      background: 'linear-gradient(to top, rgba(46,74,46,0.72) 0%, rgba(46,74,46,0.15) 60%, rgba(0,0,0,0) 100%)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: 16,
      insetInlineEnd: 16,
      color: 'rgba(255,255,255,0.8)',
      fontFamily: 'var(--font-english)',
      fontStyle: 'italic',
      fontWeight: 600,
      fontSize: 28
    }
  }, String(i + 1).padStart(2, '0')), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      bottom: 20,
      insetInlineStart: 20,
      insetInlineEnd: 20,
      color: '#fff'
    }
  }, /*#__PURE__*/React.createElement(CategoryLineArt, {
    type: c.key,
    size: 44,
    stroke: "#fff",
    strokeWidth: 1.6
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-headline)',
      fontWeight: 700,
      fontSize: 22,
      marginTop: 8
    }
  }, c.name))))), /*#__PURE__*/React.createElement("style", null, `
        @media (max-width: 720px) {
          .cat-grid { grid-template-columns: repeat(2, 1fr) !important; grid-auto-rows: 180px !important; }
          .cat-grid button[style*="span 2"] { grid-column: span 2 !important; }
        }
      `));
}
window.CategoryGrid = CategoryGrid;
})(); } catch (e) { __ds_ns.__errors.push({ path: "homepage/parts/CategoryGrid.jsx", error: String((e && e.message) || e) }); }

// homepage/parts/EditorialBreath.jsx
try { (() => {
// Section 2 — Editorial Breath.
// Pure typography on cream. No image. 70% whitespace.
// Apple principle: whitespace IS the design.
function EditorialBreath() {
  return /*#__PURE__*/React.createElement("section", {
    style: {
      background: 'var(--background)',
      padding: 'clamp(72px, 12vw, 120px) 24px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 720,
      margin: '0 auto',
      textAlign: 'center'
    }
  }, /*#__PURE__*/React.createElement("p", {
    style: {
      fontFamily: 'var(--font-headline)',
      fontStyle: 'italic',
      fontWeight: 400,
      fontSize: 'clamp(32px, 5vw, 52px)',
      lineHeight: 1.2,
      color: 'var(--site-text)',
      margin: 0,
      textWrap: 'balance'
    }
  }, "\u05DB\u05E9\u05D0\u05EA \u05D9\u05D5\u05D3\u05E2\u05EA \u05DE\u05D0\u05D9\u05E4\u05D4 \u05D4\u05D0\u05D5\u05DB\u05DC \u05E9\u05DC\u05DA \u2014", /*#__PURE__*/React.createElement("br", null), "\u05D4\u05DB\u05DC \u05D8\u05D5\u05E2\u05DD \u05D0\u05D7\u05E8\u05EA."), /*#__PURE__*/React.createElement("div", {
    "aria-hidden": "true",
    style: {
      margin: '48px auto 0',
      display: 'flex',
      justifyContent: 'center',
      color: 'var(--accent)',
      opacity: 0.7
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "64",
    height: "28",
    viewBox: "0 0 64 28",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.2",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M2 14 C 12 6 20 22 32 14 C 44 6 52 22 62 14"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M14 14 C 14 10 12 8 14 5"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M32 14 C 32 10 30 8 32 5"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M50 14 C 50 10 48 8 50 5"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "32",
    cy: "14",
    r: "1.2",
    fill: "currentColor",
    stroke: "none"
  }))), /*#__PURE__*/React.createElement("p", {
    style: {
      fontFamily: 'var(--font-english)',
      fontStyle: 'italic',
      fontWeight: 400,
      fontSize: 18,
      color: 'var(--accent)',
      margin: '32px 0 0',
      letterSpacing: '0.01em'
    }
  }, "\u2014 \u05E1\u05E4\u05D9\u05E8, \u05DE\u05D9\u05D9\u05E1\u05D3\u05EA \u05DE\u05D4\u05DE\u05E7\u05D5\u05E8")));
}
window.EditorialBreath = EditorialBreath;
})(); } catch (e) { __ds_ns.__errors.push({ path: "homepage/parts/EditorialBreath.jsx", error: String((e && e.message) || e) }); }

// homepage/parts/FeaturedProducers.jsx
try { (() => {
// Section 4 — Featured Producers · מומלצות השבוע
// 4 ProducerCards on desktop, horizontal-scroll on mobile.
const WEEKLY_PICKS = [{
  id: 1,
  name: 'דנה, מאפיית המחמצת',
  city: 'תל אביב',
  category: '🍞 לחמים',
  img: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=800&auto=format&q=80',
  price: 'מ-₪ 38',
  verified: true,
  editorsPick: true,
  tags: ['🍞 מחמצת', 'שיפון מלא'],
  top: 'לחם כפרי בטחינה איטית, 48 שעות'
}, {
  id: 2,
  name: 'החווה של מרים',
  city: 'גליל עליון',
  category: '🧀 גבינות',
  img: 'https://images.unsplash.com/photo-1486297678162-eb2a19b0a32d?w=800&auto=format&q=80',
  price: 'מ-₪ 28',
  verified: true,
  today: true,
  tags: ['🌿 אורגני', '✡️ מהדרין']
}, {
  id: 3,
  name: 'שמן מעין זית',
  city: 'הגליל',
  category: '🫒 שמנים',
  img: 'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=800&auto=format&q=80',
  price: '₪ 78 / 500מ״ל',
  verified: true,
  premium: true,
  tags: ['כתית מעולה']
}, {
  id: 4,
  name: 'הגינה של שרונה',
  city: 'מודיעין',
  category: '🥬 ירקות',
  img: 'https://images.unsplash.com/photo-1540420773420-3366772f4999?w=800&auto=format&q=80',
  verified: true,
  today: true,
  tags: ['🌿 אורגני', '🚚 משלוח'],
  top: 'סלסלת ירקות עונתית'
}];
function FeaturedProducers({
  onCardClick
}) {
  return /*#__PURE__*/React.createElement("section", {
    style: {
      background: 'var(--background)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 'var(--container-max)',
      margin: '0 auto',
      padding: '80px 24px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: 48,
      maxWidth: 720
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-body)',
      fontWeight: 500,
      fontSize: 11,
      letterSpacing: '0.15em',
      textTransform: 'uppercase',
      color: 'var(--accent)',
      marginBottom: 12
    }
  }, "ISSUE 01 \xB7 \u05E9\u05D1\u05D5\u05E2 16 \xB7 2026"), /*#__PURE__*/React.createElement("h2", {
    style: {
      fontFamily: 'var(--font-headline)',
      fontWeight: 900,
      fontSize: 'clamp(36px, 5vw, 48px)',
      lineHeight: 1.05,
      letterSpacing: '-0.02em',
      margin: '0 0 16px',
      color: 'var(--site-text)'
    }
  }, "\u05DE\u05D5\u05DE\u05DC\u05E6\u05D5\u05EA \u05D4\u05E9\u05D1\u05D5\u05E2"), /*#__PURE__*/React.createElement("p", {
    style: {
      fontFamily: 'var(--font-body)',
      fontWeight: 400,
      fontSize: 17,
      lineHeight: 1.6,
      color: 'var(--site-muted)',
      margin: 0
    }
  }, "\u05D1\u05EA\u05D9 \u05E2\u05E1\u05E7 \u05E9\u05E1\u05E4\u05D9\u05E8 \u05D1\u05D7\u05E8\u05D4 \u05D1\u05E2\u05E6\u05DE\u05D4")), /*#__PURE__*/React.createElement("div", {
    className: "weekly-scroll",
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(4, 1fr)',
      gap: 20
    }
  }, WEEKLY_PICKS.map(p => /*#__PURE__*/React.createElement("div", {
    key: p.id,
    style: {
      position: 'relative'
    }
  }, /*#__PURE__*/React.createElement(ProducerCard, {
    p: p,
    onClick: onCardClick
  }), p.editorsPick && /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      top: 12,
      insetInlineEnd: 12,
      background: 'var(--accent)',
      color: '#fff',
      fontFamily: 'var(--font-body)',
      fontWeight: 600,
      fontSize: 11,
      letterSpacing: '0.06em',
      padding: '5px 12px',
      borderRadius: 9999,
      zIndex: 2,
      boxShadow: '0 4px 12px rgba(139,105,20,0.28)'
    }
  }, "\u2605 \u05D1\u05D7\u05D9\u05E8\u05EA \u05E1\u05E4\u05D9\u05E8")))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'center',
      marginTop: 48
    }
  }, /*#__PURE__*/React.createElement("a", {
    href: "#all",
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 10,
      background: 'transparent',
      color: 'var(--primary)',
      border: '1px solid var(--primary)',
      padding: '14px 28px',
      borderRadius: 'var(--radius-md)',
      fontFamily: 'var(--font-body)',
      fontWeight: 500,
      fontSize: 15,
      textDecoration: 'none',
      minHeight: 52,
      transition: 'background 200ms var(--ease-out), color 200ms'
    },
    onMouseEnter: e => {
      e.currentTarget.style.background = 'var(--primary)';
      e.currentTarget.style.color = '#fff';
    },
    onMouseLeave: e => {
      e.currentTarget.style.background = 'transparent';
      e.currentTarget.style.color = 'var(--primary)';
    }
  }, "\u05E8\u05D0\u05D9 \u05D0\u05EA \u05DB\u05DC 247 \u05D1\u05EA\u05D9 \u05D4\u05E2\u05E1\u05E7", /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-english)',
      fontStyle: 'italic'
    }
  }, "\u2192")))), /*#__PURE__*/React.createElement("style", null, `
        @media (max-width: 960px) {
          .weekly-scroll {
            grid-template-columns: none !important;
            display: flex !important;
            overflow-x: auto;
            scroll-snap-type: x mandatory;
            gap: 12px !important;
            padding-bottom: 8px;
            scrollbar-width: none;
          }
          .weekly-scroll::-webkit-scrollbar { display: none; }
          .weekly-scroll > div {
            flex: 0 0 75%;
            scroll-snap-align: start;
          }
        }
      `));
}
window.FeaturedProducers = FeaturedProducers;
})(); } catch (e) { __ds_ns.__errors.push({ path: "homepage/parts/FeaturedProducers.jsx", error: String((e && e.message) || e) }); }

// homepage/parts/Header.jsx
try { (() => {
// Header — sticky cream navbar, blurs on scroll.
const {
  useState: hUseState,
  useEffect: hUseEffect
} = React;
function Header({
  onNav
}) {
  const [scrolled, setScrolled] = hUseState(false);
  const [menu, setMenu] = hUseState(false);
  hUseEffect(() => {
    const on = () => setScrolled(window.scrollY > 60);
    window.addEventListener('scroll', on, {
      passive: true
    });
    on();
    return () => window.removeEventListener('scroll', on);
  }, []);
  const nav = [{
    k: 'discover',
    l: 'לגלות'
  }, {
    k: 'map',
    l: 'מפה'
  }, {
    k: 'events',
    l: 'אירועים'
  }, {
    k: 'neighbor',
    l: 'מהמטבח של השכן'
  }, {
    k: 'about',
    l: 'עלינו'
  }];
  return /*#__PURE__*/React.createElement("header", {
    style: {
      position: 'sticky',
      top: 0,
      zIndex: 50,
      background: scrolled ? 'rgba(245,240,232,0.85)' : 'var(--background)',
      backdropFilter: scrolled ? 'blur(12px)' : 'none',
      borderBottom: `1px solid ${scrolled ? 'var(--border)' : 'transparent'}`,
      boxShadow: scrolled ? 'var(--shadow-header)' : 'none',
      transition: 'all 300ms var(--ease-out)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 'var(--container-max)',
      margin: '0 auto',
      padding: '0 16px',
      height: 72,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 24
    }
  }, /*#__PURE__*/React.createElement("a", {
    href: "#",
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      textDecoration: 'none'
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: "../../assets/logo.png",
    alt: "\u05DE\u05D4\u05DE\u05E7\u05D5\u05E8",
    style: {
      height: 36
    }
  })), /*#__PURE__*/React.createElement("nav", {
    className: "desktop-nav",
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 24
    }
  }, nav.map(n => /*#__PURE__*/React.createElement("a", {
    key: n.k,
    href: "#",
    onClick: e => {
      e.preventDefault();
      onNav?.(n.k);
    },
    style: {
      color: 'var(--fg-muted)',
      textDecoration: 'none',
      fontSize: 15,
      transition: 'color .25s'
    },
    onMouseOver: e => e.currentTarget.style.color = 'var(--primary)',
    onMouseOut: e => e.currentTarget.style.color = 'var(--fg-muted)'
  }, n.l)), /*#__PURE__*/React.createElement("a", {
    href: "#",
    onClick: e => {
      e.preventDefault();
      onNav?.('register');
    },
    style: {
      background: 'var(--primary)',
      color: '#fff',
      padding: '10px 18px',
      borderRadius: 9999,
      textDecoration: 'none',
      fontSize: 14,
      fontWeight: 500
    }
  }, "\u05D4\u05D5\u05E1\u05D9\u05E4\u05D9 \u05D0\u05EA \u05D4\u05E2\u05E1\u05E7 \u05E9\u05DC\u05DA"), /*#__PURE__*/React.createElement("span", {
    className: "eyebrow",
    style: {
      border: '1px solid var(--border)',
      padding: '4px 10px',
      borderRadius: 9999,
      fontSize: 11,
      color: 'var(--fg-muted)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--primary)',
      fontWeight: 700
    }
  }, "\u05E2\u05D1"), " / EN")), /*#__PURE__*/React.createElement("button", {
    className: "mobile-only",
    "aria-label": "\u05E4\u05EA\u05D7 \u05EA\u05E4\u05E8\u05D9\u05D8",
    onClick: () => setMenu(!menu),
    style: {
      background: 'none',
      border: 'none',
      color: 'var(--fg)',
      cursor: 'pointer',
      padding: 8
    }
  }, /*#__PURE__*/React.createElement(IconMenu, null))), menu && /*#__PURE__*/React.createElement("div", {
    className: "mobile-only",
    style: {
      background: 'var(--background)',
      borderTop: '1px solid var(--border)',
      padding: '12px 16px',
      display: 'flex',
      flexDirection: 'column',
      gap: 12
    }
  }, nav.map(n => /*#__PURE__*/React.createElement("a", {
    key: n.k,
    href: "#",
    onClick: e => {
      e.preventDefault();
      onNav?.(n.k);
      setMenu(false);
    },
    style: {
      fontFamily: 'var(--font-headline)',
      fontSize: 22,
      color: 'var(--fg)',
      textDecoration: 'none'
    }
  }, n.l)), /*#__PURE__*/React.createElement("a", {
    href: "#",
    onClick: e => {
      e.preventDefault();
      onNav?.('register');
      setMenu(false);
    },
    style: {
      color: 'var(--primary)',
      fontWeight: 600,
      fontFamily: 'var(--font-headline)',
      fontSize: 22
    }
  }, "\u05D4\u05D5\u05E1\u05D9\u05E4\u05D9 \u05D0\u05EA \u05D4\u05E2\u05E1\u05E7 \u05E9\u05DC\u05DA")));
}
window.Header = Header;
})(); } catch (e) { __ds_ns.__errors.push({ path: "homepage/parts/Header.jsx", error: String((e && e.message) || e) }); }

// homepage/parts/Hero.jsx
try { (() => {
// Hero — asymmetric split: large cream panel with editorial type + image panel with Ken Burns.
function Hero({
  onSearch,
  onNearMe,
  onDiscover
}) {
  const [q, setQ] = React.useState('');
  return /*#__PURE__*/React.createElement("section", {
    style: {
      position: 'relative',
      background: 'var(--background)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 'var(--container-max)',
      margin: '0 auto',
      padding: '48px 16px 80px',
      display: 'grid',
      gridTemplateColumns: '1.1fr 1fr',
      gap: 56,
      alignItems: 'center'
    },
    className: "hero-grid"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "eyebrow",
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      color: 'var(--accent)'
    }
  }, /*#__PURE__*/React.createElement("span", null, "\u05D2\u05D9\u05DC\u05D9\u05D5\u05DF 01"), /*#__PURE__*/React.createElement("span", {
    style: {
      width: 36,
      height: 1,
      background: 'var(--accent)',
      display: 'inline-block'
    }
  }), /*#__PURE__*/React.createElement("span", null, "\u05D0\u05E4\u05E8\u05D9\u05DC 2026")), /*#__PURE__*/React.createElement("h1", {
    style: {
      fontFamily: 'var(--font-headline)',
      fontWeight: 900,
      fontSize: 'clamp(48px, 7vw, 92px)',
      lineHeight: 0.95,
      letterSpacing: '-0.02em',
      color: 'var(--fg)',
      margin: '20px 0 16px',
      textAlign: 'start'
    }
  }, "\u05D0\u05D5\u05DB\u05DC \u05D0\u05DE\u05D9\u05EA\u05D9,", /*#__PURE__*/React.createElement("br", null), /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--primary)'
    }
  }, "\u05D9\u05E9\u05E8 \u05DE\u05D4\u05DE\u05E7\u05D5\u05E8"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-english)',
      fontStyle: 'italic',
      fontWeight: 600,
      color: 'var(--accent)',
      fontSize: '0.7em'
    }
  }, ", \u05D0\u05DC\u05D9\u05D9\u05DA.")), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 18,
      lineHeight: 1.6,
      color: 'var(--fg-muted)',
      maxWidth: 520,
      margin: '0 0 32px'
    }
  }, "\u05D4\u05DE\u05D3\u05E8\u05D9\u05DA \u05D4\u05E8\u05D0\u05E9\u05D5\u05DF \u05D1\u05D9\u05E9\u05E8\u05D0\u05DC \u05DC\u05D7\u05E7\u05DC\u05D0\u05D9\u05D5\u05EA, \u05D0\u05D5\u05E4\u05D5\u05EA, \u05E9\u05DB\u05E0\u05D5\u05EA \u05D5\u05DE\u05D2\u05D3\u05DC\u05D5\u05EA \u05E9\u05DE\u05D5\u05DB\u05E8\u05D5\u05EA \u05D9\u05E9\u05D9\u05E8\u05D5\u05EA \u2014 \u05D1\u05DC\u05D9 \u05DE\u05EA\u05D5\u05D5\u05DB\u05D9\u05DD, \u05D1\u05DC\u05D9 \u05E9\u05D9\u05D5\u05D5\u05E7, \u05D9\u05E9\u05E8 \u05D1\u05D5\u05D5\u05D0\u05D8\u05E1\u05D0\u05E4."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexWrap: 'wrap',
      gap: 12,
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: onDiscover,
    style: {
      background: 'var(--primary)',
      color: '#fff',
      border: 'none',
      padding: '16px 28px',
      borderRadius: 'var(--radius-md)',
      fontSize: 16,
      fontWeight: 600,
      cursor: 'pointer',
      display: 'inline-flex',
      alignItems: 'center',
      gap: 10,
      minHeight: 52
    }
  }, "\u05D2\u05DC\u05D9 \u05E2\u05E1\u05E7\u05D9\u05DD \u05E7\u05E8\u05D5\u05D1\u05D9\u05DD", /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-english)',
      fontStyle: 'italic'
    }
  }, "\u2192")), /*#__PURE__*/React.createElement("button", {
    onClick: () => onNearMe?.(),
    style: {
      background: 'transparent',
      color: 'var(--primary)',
      border: '1px solid var(--primary)',
      padding: '16px 24px',
      borderRadius: 'var(--radius-md)',
      fontSize: 15,
      fontWeight: 500,
      cursor: 'pointer',
      minHeight: 52,
      display: 'inline-flex',
      alignItems: 'center',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement(IconCrosshair, {
    size: 18
  }), " \u05D0\u05D9\u05DA \u05D6\u05D4 \u05E2\u05D5\u05D1\u05D3")), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 40,
      display: 'flex',
      gap: 24,
      alignItems: 'center',
      flexWrap: 'wrap',
      paddingTop: 24,
      borderTop: '1px solid var(--border)'
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-english)',
      fontStyle: 'italic',
      fontWeight: 600,
      color: 'var(--accent)',
      fontSize: 28
    }
  }, "248"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: 'var(--fg-muted)',
      letterSpacing: '0.08em',
      textTransform: 'uppercase'
    }
  }, "\u05D1\u05EA\u05D9 \u05E2\u05E1\u05E7 \u05DE\u05D0\u05D5\u05DE\u05EA\u05D9\u05DD")), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-english)',
      fontStyle: 'italic',
      fontWeight: 600,
      color: 'var(--accent)',
      fontSize: 28
    }
  }, "12"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: 'var(--fg-muted)',
      letterSpacing: '0.08em',
      textTransform: 'uppercase'
    }
  }, "\u05E7\u05D8\u05D2\u05D5\u05E8\u05D9\u05D5\u05EA")), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-english)',
      fontStyle: 'italic',
      fontWeight: 600,
      color: 'var(--accent)',
      fontSize: 28
    }
  }, "\uD83C\uDDEE\uD83C\uDDF1"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: 'var(--fg-muted)',
      letterSpacing: '0.08em',
      textTransform: 'uppercase'
    }
  }, "\u05DE\u05DB\u05DC \u05E8\u05D7\u05D1\u05D9 \u05D4\u05D0\u05E8\u05E5")))), /*#__PURE__*/React.createElement("div", {
    className: "hero-image",
    style: {
      position: 'relative',
      aspectRatio: '4/5',
      borderRadius: 24,
      overflow: 'hidden',
      background: '#c9b28a'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: '-5%',
      backgroundImage: 'url(https://images.unsplash.com/photo-1542838132-92c53300491e?w=1200&auto=format&q=80)',
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      animation: 'kenburns 20s ease-in-out infinite alternate'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      background: 'linear-gradient(to top, rgba(46,74,46,0.55) 0%, rgba(0,0,0,0) 60%)'
    }
  }), /*#__PURE__*/React.createElement("svg", {
    style: {
      position: 'absolute',
      top: 20,
      left: 20,
      color: '#fff',
      opacity: 0.9
    },
    width: "52",
    height: "52",
    viewBox: "0 0 52 52",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2.5",
    strokeLinecap: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M8 28 C 14 26 18 30 22 32 C 28 34 34 20 46 10",
    style: {
      strokeDasharray: '100',
      strokeDashoffset: 0
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      bottom: 24,
      insetInlineStart: 24,
      insetInlineEnd: 24,
      color: '#fff'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "eyebrow",
    style: {
      color: 'rgba(255,255,255,0.85)',
      marginBottom: 6
    }
  }, "FEATURED \xB7 \u05D4\u05E9\u05D1\u05D5\u05E2"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-headline)',
      fontWeight: 700,
      fontSize: 22,
      lineHeight: 1.25
    }
  }, "\u05D4\u05D7\u05D5\u05D5\u05D4 \u05E9\u05DC \u05DE\u05E8\u05D9\u05DD, \u05D2\u05DC\u05D9\u05DC \u05E2\u05DC\u05D9\u05D5\u05DF"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      opacity: 0.85
    }
  }, "\u05D2\u05D1\u05D9\u05E0\u05D5\u05EA \u05E2\u05D9\u05D6\u05D9\u05DD \xB7 \u05D7\u05DC\u05D1 \u05D8\u05E8\u05D9 \xB7 \u05DC\u05D7\u05DD \u05DE\u05D7\u05DE\u05E6\u05EA")))), /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 'var(--container-max)',
      margin: '-40px auto 0',
      padding: '0 16px',
      position: 'relative'
    }
  }, /*#__PURE__*/React.createElement("form", {
    onSubmit: e => {
      e.preventDefault();
      onSearch?.(q);
    },
    style: {
      background: '#fff',
      borderRadius: 9999,
      border: '1px solid var(--border)',
      padding: '6px 8px 6px 24px',
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      boxShadow: 'var(--shadow-card)',
      maxWidth: 680,
      marginInline: 'auto'
    }
  }, /*#__PURE__*/React.createElement(IconSearch, {
    stroke: "var(--primary)"
  }), /*#__PURE__*/React.createElement("input", {
    value: q,
    onChange: e => setQ(e.target.value),
    placeholder: "\u05D7\u05E4\u05E9\u05D9 \u05E2\u05D9\u05E8, \u05E7\u05D8\u05D2\u05D5\u05E8\u05D9\u05D4 \u05D0\u05D5 \u05D1\u05D9\u05EA \u05E2\u05E1\u05E7...",
    style: {
      flex: 1,
      border: 'none',
      outline: 'none',
      fontSize: 16,
      background: 'transparent',
      color: 'var(--fg)',
      fontFamily: 'var(--font-body)'
    }
  }), /*#__PURE__*/React.createElement("button", {
    type: "submit",
    style: {
      background: 'var(--primary)',
      color: '#fff',
      border: 'none',
      padding: '12px 24px',
      borderRadius: 9999,
      cursor: 'pointer',
      fontSize: 14,
      fontWeight: 500
    }
  }, "\u05D7\u05E4\u05E9\u05D9"))), /*#__PURE__*/React.createElement("style", null, `
        @keyframes kenburns { 0% { transform: scale(1) translate(0,0);} 100% { transform: scale(1.08) translate(-2%,-1%);} }
        @media (max-width: 820px) {
          .hero-grid { grid-template-columns: 1fr !important; gap: 32px !important; padding-bottom: 120px !important; }
          .hero-image { aspect-ratio: 3/4 !important; }
        }
      `));
}
window.Hero = Hero;
})(); } catch (e) { __ds_ns.__errors.push({ path: "homepage/parts/Hero.jsx", error: String((e && e.message) || e) }); }

// homepage/parts/HowItWorks.jsx
try { (() => {
// Section 7 — How It Works (3 steps).
// Numbered editorial steps with hand-drawn connecting line.
function HowItWorks() {
  const steps = [{
    n: '01',
    title: 'גלי',
    body: 'חפשי לפי עיר או קטגוריה. כל בית עסק עם סיפור, תמונות, וציון אחרון של השכנות.'
  }, {
    n: '02',
    title: 'צרי קשר',
    body: 'כפתור WhatsApp אחד. בלי טפסים. בלי מתווכים. דברי ישר עם מי שגידלה או אפתה.'
  }, {
    n: '03',
    title: 'קבלי',
    body: 'איסוף עצמי, משלוח מקומי, או שיחה ידידותית. אוכל אמיתי, ישר מהמקור.'
  }];
  return /*#__PURE__*/React.createElement("section", {
    style: {
      background: 'var(--background)',
      borderBlock: '1px solid var(--border)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 'var(--container-max)',
      margin: '0 auto',
      padding: '96px 24px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: 'center',
      marginBottom: 64
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-body)',
      fontWeight: 500,
      fontSize: 11,
      letterSpacing: '0.15em',
      textTransform: 'uppercase',
      color: 'var(--accent)',
      marginBottom: 12
    }
  }, "\u05D0\u05D9\u05DA \u05D6\u05D4 \u05E2\u05D5\u05D1\u05D3"), /*#__PURE__*/React.createElement("h2", {
    style: {
      fontFamily: 'var(--font-headline)',
      fontWeight: 700,
      fontSize: 'clamp(32px, 4.5vw, 52px)',
      lineHeight: 1.1,
      letterSpacing: '-0.01em',
      margin: 0,
      color: 'var(--site-text)'
    }
  }, "\u05E9\u05DC\u05D5\u05E9\u05D4 \u05E6\u05E2\u05D3\u05D9\u05DD, ", /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-english)',
      fontStyle: 'italic',
      fontWeight: 600,
      color: 'var(--accent)'
    }
  }, "\u05E9\u05D5\u05DD \u05D8\u05E8\u05D9\u05E7."))), /*#__PURE__*/React.createElement("div", {
    className: "hiw-grid",
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(3, 1fr)',
      gap: 48,
      position: 'relative'
    }
  }, steps.map((s, i) => /*#__PURE__*/React.createElement("div", {
    key: s.n,
    style: {
      position: 'relative'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-english)',
      fontStyle: 'italic',
      fontWeight: 600,
      color: 'var(--accent)',
      fontSize: 64,
      lineHeight: 1
    }
  }, s.n), /*#__PURE__*/React.createElement("div", {
    style: {
      width: 40,
      height: 1,
      background: 'var(--border)',
      margin: '20px 0'
    }
  }), /*#__PURE__*/React.createElement("h3", {
    style: {
      fontFamily: 'var(--font-headline)',
      fontWeight: 700,
      fontSize: 28,
      margin: '0 0 12px',
      color: 'var(--site-text)'
    }
  }, s.title), /*#__PURE__*/React.createElement("p", {
    style: {
      fontFamily: 'var(--font-body)',
      fontWeight: 400,
      fontSize: 16,
      lineHeight: 1.7,
      color: 'var(--site-muted)',
      margin: 0
    }
  }, s.body), i < 2 && /*#__PURE__*/React.createElement("svg", {
    style: {
      position: 'absolute',
      top: 22,
      insetInlineStart: -32,
      color: 'var(--border)'
    },
    width: "56",
    height: "24",
    viewBox: "0 0 56 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.5",
    strokeLinecap: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M4 12 C 14 4 26 20 36 10 C 42 4 48 14 52 12"
  })))))), /*#__PURE__*/React.createElement("style", null, `
        @media (max-width: 720px) {
          .hiw-grid { grid-template-columns: 1fr !important; gap: 40px !important; }
        }
      `));
}
window.HowItWorks = HowItWorks;
})(); } catch (e) { __ds_ns.__errors.push({ path: "homepage/parts/HowItWorks.jsx", error: String((e && e.message) || e) }); }

// homepage/parts/MeetAProducer.jsx
try { (() => {
// Section 6 — Meet a Producer.
// 50/50 split: portrait photograph + profile text. The human face.
function MeetAProducer() {
  return /*#__PURE__*/React.createElement("section", {
    style: {
      background: 'var(--background)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 'var(--container-max)',
      margin: '0 auto',
      padding: '80px 24px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "meet-grid",
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 64,
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      aspectRatio: '4/5',
      borderRadius: 'var(--radius-lg)',
      overflow: 'hidden',
      background: '#c9b28a'
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: "https://images.unsplash.com/photo-1580837119756-563d608dd119?w=1000&auto=format&q=80",
    alt: "\u05DE\u05E8\u05D9\u05DD \u05D1\u05DE\u05D7\u05DC\u05D1\u05D4 \u05E9\u05DC\u05D4 \u05D1\u05D2\u05DC\u05D9\u05DC",
    style: {
      width: '100%',
      height: '100%',
      objectFit: 'cover',
      display: 'block'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      bottom: 16,
      insetInlineStart: 16,
      background: 'rgba(245,240,232,0.94)',
      padding: '8px 14px',
      borderRadius: 'var(--radius-sm)',
      fontFamily: 'var(--font-english)',
      fontStyle: 'italic',
      fontSize: 13,
      color: 'var(--site-text)'
    }
  }, "\u05E6\u05D9\u05DC\u05D5\u05DD: \u05D9\u05E2\u05DC \u05E2\u05DE\u05D9\u05EA")), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-body)',
      fontWeight: 500,
      fontSize: 11,
      letterSpacing: '0.15em',
      textTransform: 'uppercase',
      color: 'var(--accent)',
      marginBottom: 16
    }
  }, "\u05D4\u05DB\u05D9\u05E8\u05D9 \u05D0\u05EA"), /*#__PURE__*/React.createElement("h2", {
    style: {
      fontFamily: 'var(--font-headline)',
      fontWeight: 900,
      fontSize: 'clamp(44px, 6vw, 72px)',
      lineHeight: 0.95,
      letterSpacing: '-0.02em',
      margin: '0 0 24px',
      color: 'var(--site-text)'
    }
  }, "\u05DE\u05E8\u05D9\u05DD \u05DE", /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--primary)'
    }
  }, "\u05DE\u05E2\u05DC\u05D5\u05EA"), ",", /*#__PURE__*/React.createElement("br", null), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-english)',
      fontStyle: 'italic',
      fontWeight: 600,
      color: 'var(--accent)'
    }
  }, "\u05D2\u05D1\u05D9\u05E0\u05D0\u05D9\u05EA.")), /*#__PURE__*/React.createElement("blockquote", {
    style: {
      fontFamily: 'var(--font-headline)',
      fontStyle: 'italic',
      fontWeight: 400,
      fontSize: 22,
      lineHeight: 1.5,
      color: 'var(--site-text)',
      margin: '0 0 28px',
      maxWidth: 520,
      borderInlineStart: '3px solid var(--accent)',
      paddingInlineStart: 20
    }
  }, "\"11 \u05E2\u05D9\u05D6\u05D9\u05DD, 4 \u05D6\u05E0\u05D9 \u05D2\u05D1\u05D9\u05E0\u05D4, 0 \u05E4\u05E9\u05E8\u05D5\u05EA. \u05D0\u05E0\u05D9 \u05DE\u05DB\u05D9\u05E8\u05D4 \u05DB\u05DC \u05D9\u05DC\u05D3\u05D4 \u05E9\u05D1\u05D0\u05D4 \u05DC\u05E7\u05D7\u05EA \u05DE\u05D4\u05D2\u05D1\u05D9\u05E0\u05D5\u05EA \u05E9\u05DC\u05D9 \u2014 \u05D5\u05D6\u05D4 \u05DE\u05D4 \u05E9\u05E2\u05D5\u05E9\u05D4 \u05D0\u05EA \u05D4\u05D4\u05D1\u05D3\u05DC.\""), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexWrap: 'wrap',
      gap: 8,
      marginBottom: 32
    }
  }, ['🌿 אורגני', '🐐 חלב גולמי', '✡️ מהדרין', '🚚 משלוח בצפון'].map(t => /*#__PURE__*/React.createElement("span", {
    key: t,
    style: {
      background: 'var(--light)',
      color: 'var(--primary)',
      padding: '6px 14px',
      borderRadius: 9999,
      fontSize: 13,
      fontFamily: 'var(--font-body)',
      fontWeight: 500
    }
  }, t))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 12,
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement("a", {
    href: "#miriam",
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 10,
      background: 'var(--primary)',
      color: '#fff',
      border: 'none',
      padding: '14px 24px',
      borderRadius: 'var(--radius-md)',
      fontSize: 15,
      fontWeight: 600,
      textDecoration: 'none',
      minHeight: 52,
      fontFamily: 'var(--font-body)'
    }
  }, "\u05E7\u05E8\u05D0\u05D9 \u05D0\u05EA \u05D4\u05E1\u05D9\u05E4\u05D5\u05E8 \u05E9\u05DC \u05DE\u05E8\u05D9\u05DD", /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-english)',
      fontStyle: 'italic'
    }
  }, "\u2192")), /*#__PURE__*/React.createElement("a", {
    href: "#whatsapp",
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 10,
      background: '#fff',
      color: 'var(--primary)',
      border: '1px solid var(--border)',
      padding: '14px 20px',
      borderRadius: 'var(--radius-md)',
      fontSize: 15,
      fontWeight: 500,
      textDecoration: 'none',
      minHeight: 52,
      fontFamily: 'var(--font-body)'
    }
  }, /*#__PURE__*/React.createElement(IconWhatsApp, {
    size: 18
  }), " \u05D5\u05D5\u05D0\u05D8\u05E1\u05D0\u05E4"))))), /*#__PURE__*/React.createElement("style", null, `
        @media (max-width: 820px) {
          .meet-grid { grid-template-columns: 1fr !important; gap: 32px !important; }
        }
      `));
}
window.MeetAProducer = MeetAProducer;
})(); } catch (e) { __ds_ns.__errors.push({ path: "homepage/parts/MeetAProducer.jsx", error: String((e && e.message) || e) }); }

// homepage/parts/OliveBranch.jsx
try { (() => {
// Hand-drawn olive branch, in the spirit of Kinfolk / Graza —
// loose, imperfect, 1.5px strokes. Two curving leaves + a tiny olive.
// Color is inherited via `currentColor`. Companion size is ~60% cap-height.
function OliveBranch({
  size = 48,
  strokeWidth = 1.5,
  style,
  className
}) {
  return /*#__PURE__*/React.createElement("svg", {
    width: size,
    height: size,
    viewBox: "0 0 48 48",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: strokeWidth,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    style: style,
    className: className,
    "aria-hidden": "true"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M 8 40 C 14 32, 20 26, 28 18 C 32 14, 36 10, 40 8"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M 16 32 C 12 30, 9 30, 7 32 C 9 35, 13 36, 17 34"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M 24 24 C 28 20, 32 19, 34 21 C 32 25, 28 27, 24 26"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M 34 14 C 37 11, 40 11, 41 13 C 40 16, 37 17, 35 16"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "20.5",
    cy: "30",
    r: "1.6",
    fill: "currentColor",
    stroke: "none"
  }));
}
window.OliveBranch = OliveBranch;
})(); } catch (e) { __ds_ns.__errors.push({ path: "homepage/parts/OliveBranch.jsx", error: String((e && e.message) || e) }); }

// homepage/parts/ProducerCard.jsx
try { (() => {
function ProducerCard({
  p,
  onClick
}) {
  return /*#__PURE__*/React.createElement("article", {
    style: {
      background: '#fff',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-md)',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      cursor: 'pointer',
      transition: 'transform .3s var(--ease-out), box-shadow .3s var(--ease-out)'
    },
    onMouseEnter: e => {
      e.currentTarget.style.transform = 'translateY(-2px)';
      e.currentTarget.style.boxShadow = 'var(--shadow-card)';
    },
    onMouseLeave: e => {
      e.currentTarget.style.transform = 'none';
      e.currentTarget.style.boxShadow = 'none';
    },
    onClick: () => onClick?.(p)
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      aspectRatio: '4/3',
      background: 'var(--light)',
      overflow: 'hidden'
    }
  }, p.img ? /*#__PURE__*/React.createElement("img", {
    src: p.img,
    alt: p.name,
    style: {
      width: '100%',
      height: '100%',
      objectFit: 'cover'
    }
  }) : /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'column',
      color: 'var(--primary)'
    }
  }, /*#__PURE__*/React.createElement(IconLeaf, {
    size: 48,
    stroke: "var(--primary)"
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-headline)',
      fontWeight: 700,
      fontSize: 28,
      marginTop: 6
    }
  }, p.name?.slice(0, 1))), /*#__PURE__*/React.createElement("button", {
    "aria-label": "\u05E9\u05DE\u05E8\u05D9 \u05DC\u05DE\u05D5\u05E2\u05D3\u05E4\u05D9\u05DD",
    style: {
      position: 'absolute',
      top: 10,
      insetInlineStart: 10,
      width: 44,
      height: 44,
      borderRadius: 9999,
      background: 'rgba(255,255,255,0.95)',
      border: 'none',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: p.saved ? '#e8823a' : 'var(--fg-muted)'
    }
  }, /*#__PURE__*/React.createElement(IconHeart, {
    size: 20,
    fill: p.saved ? 'currentColor' : 'none'
  })), p.verified && /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      top: 12,
      insetInlineEnd: 12,
      background: 'var(--primary)',
      color: '#fff',
      fontSize: 11,
      padding: '4px 10px',
      borderRadius: 9999,
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      fontWeight: 600
    }
  }, /*#__PURE__*/React.createElement(IconSeal, {
    size: 12
  }), " \u05DE\u05D0\u05D5\u05DE\u05EA"), p.premium && /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      top: 48,
      insetInlineEnd: 12,
      background: 'var(--accent)',
      color: '#fff',
      fontSize: 11,
      padding: '4px 10px',
      borderRadius: 9999,
      fontWeight: 600
    }
  }, "\u05E4\u05E8\u05DE\u05D9\u05D5\u05DD"), p.today && /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      bottom: 12,
      insetInlineEnd: 12,
      background: 'var(--secondary)',
      color: '#fff',
      fontSize: 11,
      padding: '4px 10px',
      borderRadius: 9999,
      fontWeight: 600
    }
  }, "\u05D6\u05DE\u05D9\u05DF \u05D4\u05D9\u05D5\u05DD")), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: 16,
      display: 'flex',
      flexDirection: 'column',
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("h3", {
    style: {
      fontFamily: 'var(--font-headline)',
      fontWeight: 700,
      fontSize: 20,
      margin: 0,
      color: 'var(--fg)',
      lineHeight: 1.25
    }
  }, p.name), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 13,
      color: 'var(--fg-muted)',
      margin: '6px 0 0'
    }
  }, p.city, " \xB7 ", p.category), p.top && /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 14,
      color: 'var(--fg)',
      margin: '8px 0 0',
      opacity: 0.85
    }
  }, p.top), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexWrap: 'wrap',
      gap: 6,
      marginTop: 10
    }
  }, p.tags?.map(t => /*#__PURE__*/React.createElement("span", {
    key: t,
    style: {
      background: 'var(--light)',
      color: 'var(--primary)',
      padding: '3px 10px',
      borderRadius: 20,
      fontSize: 12
    }
  }, t))), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 'auto',
      paddingTop: 12,
      borderTop: '1px solid var(--border)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 2
    }
  }, /*#__PURE__*/React.createElement("a", {
    href: "#",
    onClick: e => e.stopPropagation(),
    "aria-label": "WhatsApp",
    style: {
      width: 44,
      height: 44,
      borderRadius: 9999,
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'var(--primary)',
      textDecoration: 'none'
    }
  }, /*#__PURE__*/React.createElement(IconWhatsApp, {
    size: 20
  })), /*#__PURE__*/React.createElement("a", {
    href: "#",
    onClick: e => e.stopPropagation(),
    "aria-label": "\u05D8\u05DC\u05E4\u05D5\u05DF",
    style: {
      width: 44,
      height: 44,
      borderRadius: 9999,
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'var(--primary)'
    }
  }, /*#__PURE__*/React.createElement(IconPhone, null)), /*#__PURE__*/React.createElement("a", {
    href: "#",
    onClick: e => e.stopPropagation(),
    "aria-label": "Instagram",
    style: {
      width: 44,
      height: 44,
      borderRadius: 9999,
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'var(--primary)'
    }
  }, /*#__PURE__*/React.createElement(IconInstagram, null))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10
    }
  }, p.price && /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-english)',
      fontStyle: 'italic',
      fontWeight: 500,
      color: 'var(--accent)',
      fontSize: 15
    }
  }, p.price)))));
}
window.ProducerCard = ProducerCard;
})(); } catch (e) { __ds_ns.__errors.push({ path: "homepage/parts/ProducerCard.jsx", error: String((e && e.message) || e) }); }

// homepage/parts/icons.jsx
try { (() => {
// Shared inline-SVG icons + brand glyphs. Pure JSX — no external deps.
const {
  createElement: h
} = React;

// Phosphor-style duotone substitutions (hand-tuned, single-path)
const IconLeaf = ({
  size = 20,
  stroke = "currentColor",
  fill = "none"
}) => /*#__PURE__*/React.createElement("svg", {
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: fill,
  stroke: stroke,
  strokeWidth: "1.5",
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": "true"
}, /*#__PURE__*/React.createElement("path", {
  d: "M11 20A7 7 0 019.8 6.1C15.5 5 17 4.48 19.2 2.96c1.4 9.3-2.5 14.48-8.2 17.04z"
}), /*#__PURE__*/React.createElement("path", {
  d: "M2 21c0-3 1.85-5.36 5.08-6"
}));
const IconHeart = ({
  size = 20,
  stroke = "currentColor",
  fill = "none"
}) => /*#__PURE__*/React.createElement("svg", {
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: fill,
  stroke: stroke,
  strokeWidth: "1.8",
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": "true"
}, /*#__PURE__*/React.createElement("path", {
  d: "M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 000-7.78z"
}));
const IconSeal = ({
  size = 14,
  fill = "currentColor"
}) => /*#__PURE__*/React.createElement("svg", {
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: fill,
  "aria-hidden": "true"
}, /*#__PURE__*/React.createElement("path", {
  d: "M12 2l2.5 2.2 3.3-.6.7 3.3L21 9l-1.5 3L21 15l-2.5 2.1-.7 3.3-3.3-.6L12 22l-2.5-2.2-3.3.6-.7-3.3L3 15l1.5-3L3 9l2.5-2.1.7-3.3 3.3.6L12 2zm-1 13l6-6-1.4-1.4L11 12.2l-2.6-2.6L7 11l4 4z"
}));
const IconHouse = ({
  size = 20,
  stroke = "currentColor",
  fill = "none"
}) => /*#__PURE__*/React.createElement("svg", {
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: fill,
  stroke: stroke,
  strokeWidth: "1.5",
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": "true"
}, /*#__PURE__*/React.createElement("path", {
  d: "M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1h-5v-7h-6v7H4a1 1 0 01-1-1V9.5z"
}));
const IconMap = ({
  size = 20,
  stroke = "currentColor",
  fill = "none"
}) => /*#__PURE__*/React.createElement("svg", {
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: fill,
  stroke: stroke,
  strokeWidth: "1.5",
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": "true"
}, /*#__PURE__*/React.createElement("path", {
  d: "M1 6v16l7-3 8 3 7-3V3l-7 3-8-3-7 3z"
}), /*#__PURE__*/React.createElement("path", {
  d: "M8 3v16M16 6v16"
}));
const IconCalendar = ({
  size = 20,
  stroke = "currentColor"
}) => /*#__PURE__*/React.createElement("svg", {
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: stroke,
  strokeWidth: "1.5",
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": "true"
}, /*#__PURE__*/React.createElement("rect", {
  x: "3",
  y: "4",
  width: "18",
  height: "18",
  rx: "2"
}), /*#__PURE__*/React.createElement("path", {
  d: "M16 2v4M8 2v4M3 10h18"
}));
const IconPot = ({
  size = 20,
  stroke = "currentColor"
}) => /*#__PURE__*/React.createElement("svg", {
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: stroke,
  strokeWidth: "1.5",
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": "true"
}, /*#__PURE__*/React.createElement("path", {
  d: "M3 10h18v4a6 6 0 01-6 6H9a6 6 0 01-6-6v-4z"
}), /*#__PURE__*/React.createElement("path", {
  d: "M5 10V8h14v2"
}), /*#__PURE__*/React.createElement("path", {
  d: "M10 4c0-1 .5-2 2-2s2 1 2 2"
}));
const IconCrosshair = ({
  size = 18,
  stroke = "currentColor"
}) => /*#__PURE__*/React.createElement("svg", {
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: stroke,
  strokeWidth: "2",
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": "true"
}, /*#__PURE__*/React.createElement("circle", {
  cx: "12",
  cy: "12",
  r: "9"
}), /*#__PURE__*/React.createElement("circle", {
  cx: "12",
  cy: "12",
  r: "3"
}), /*#__PURE__*/React.createElement("path", {
  d: "M12 2v4M12 18v4M2 12h4M18 12h4"
}));
const IconSearch = ({
  size = 18,
  stroke = "currentColor"
}) => /*#__PURE__*/React.createElement("svg", {
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: stroke,
  strokeWidth: "2",
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": "true"
}, /*#__PURE__*/React.createElement("circle", {
  cx: "11",
  cy: "11",
  r: "7"
}), /*#__PURE__*/React.createElement("path", {
  d: "m21 21-4.35-4.35"
}));
const IconMenu = ({
  size = 22,
  stroke = "currentColor"
}) => /*#__PURE__*/React.createElement("svg", {
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: stroke,
  strokeWidth: "2",
  strokeLinecap: "round",
  "aria-hidden": "true"
}, /*#__PURE__*/React.createElement("path", {
  d: "M4 6h16M4 12h16M4 18h16"
}));
const IconInstagram = ({
  size = 18,
  stroke = "currentColor"
}) => /*#__PURE__*/React.createElement("svg", {
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: stroke,
  strokeWidth: "2",
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": "true"
}, /*#__PURE__*/React.createElement("rect", {
  x: "2",
  y: "2",
  width: "20",
  height: "20",
  rx: "5"
}), /*#__PURE__*/React.createElement("path", {
  d: "M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"
}), /*#__PURE__*/React.createElement("line", {
  x1: "17.5",
  y1: "6.5",
  x2: "17.51",
  y2: "6.5"
}));
const IconPhone = ({
  size = 18,
  stroke = "currentColor"
}) => /*#__PURE__*/React.createElement("svg", {
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: stroke,
  strokeWidth: "2",
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": "true"
}, /*#__PURE__*/React.createElement("path", {
  d: "M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"
}));
const IconWhatsApp = ({
  size = 18,
  fill = "currentColor"
}) => /*#__PURE__*/React.createElement("svg", {
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: fill,
  "aria-hidden": "true"
}, /*#__PURE__*/React.createElement("path", {
  d: "M20.52 3.48A11.9 11.9 0 0012.04 0C5.45 0 .1 5.35.1 11.94c0 2.1.55 4.15 1.6 5.96L0 24l6.27-1.64a11.9 11.9 0 005.77 1.47h.01c6.59 0 11.94-5.35 11.94-11.94 0-3.19-1.24-6.19-3.47-8.41zm-3.05 10.94c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15s-.77.97-.94 1.17c-.17.2-.35.22-.65.07-.3-.15-1.25-.46-2.38-1.47-.88-.78-1.47-1.75-1.65-2.04-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.07-.15-.67-1.61-.92-2.2-.24-.58-.49-.5-.67-.51l-.57-.01c-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.48 0 1.46 1.07 2.88 1.22 3.08.15.2 2.1 3.2 5.08 4.49.71.3 1.26.49 1.69.63.71.22 1.36.19 1.87.12.57-.09 1.76-.72 2-1.41.25-.7.25-1.29.17-1.41-.07-.12-.27-.2-.57-.34z"
}));

// Hand-drawn category line-art (copied from CategoryIcons.jsx)
const CategoryLineArt = ({
  type = "veg",
  size = 64,
  stroke = "#2e6853",
  strokeWidth = 1.5
}) => {
  const paths = {
    meat: /*#__PURE__*/React.createElement("g", null, /*#__PURE__*/React.createElement("path", {
      d: "M12 44 C12 44 8 36 14 28 C20 20 32 18 38 22 C44 26 46 34 42 40 C38 46 28 48 20 46 Z"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M38 22 L52 10"
    }), /*#__PURE__*/React.createElement("circle", {
      cx: "50",
      cy: "12",
      r: "4"
    })),
    veg: /*#__PURE__*/React.createElement("g", null, /*#__PURE__*/React.createElement("path", {
      d: "M32 52 L32 20"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M32 20 C32 20 18 16 14 28 C18 28 26 26 32 32"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M32 28 C32 28 44 20 50 30 C46 32 38 30 32 36"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M28 44 L20 50"
    })),
    dairy: /*#__PURE__*/React.createElement("g", null, /*#__PURE__*/React.createElement("path", {
      d: "M24 16 L24 12 C24 10 26 8 28 8 L36 8 C38 8 40 10 40 12 L40 16"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M20 16 L20 52 C20 54 22 56 24 56 L40 56 C42 56 44 54 44 52 L44 16 Z"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M20 26 L44 26"
    })),
    bread: /*#__PURE__*/React.createElement("g", null, /*#__PURE__*/React.createElement("path", {
      d: "M14 40 C14 40 12 32 18 26 C24 20 40 20 46 26 C52 32 50 40 50 40 Z"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M14 40 L14 48 C14 50 16 52 18 52 L46 52 C48 52 50 50 50 48 L50 40"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M24 20 C24 16 22 14 24 10"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M32 20 C32 14 30 12 32 8"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M40 20 C40 16 38 14 40 10"
    })),
    oil: /*#__PURE__*/React.createElement("g", null, /*#__PURE__*/React.createElement("path", {
      d: "M22 24 L22 52 C22 54 24 56 26 56 L38 56 C40 56 42 54 42 52 L42 24 Z"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M20 24 L44 24"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M28 36 C30 32 34 32 36 36 C38 40 36 46 32 46 C28 46 26 40 28 36 Z"
    })),
    care: /*#__PURE__*/React.createElement("g", null, /*#__PURE__*/React.createElement("rect", {
      x: "18",
      y: "28",
      width: "28",
      height: "24",
      rx: "4"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M22 28 L22 22 C22 20 24 18 26 18 L38 18 C40 18 42 20 42 22 L42 28"
    }), /*#__PURE__*/React.createElement("circle", {
      cx: "26",
      cy: "16",
      r: "3"
    }), /*#__PURE__*/React.createElement("circle", {
      cx: "34",
      cy: "12",
      r: "2"
    }))
  };
  return /*#__PURE__*/React.createElement("svg", {
    width: size,
    height: size,
    viewBox: "0 0 64 64",
    fill: "none",
    stroke: stroke,
    strokeWidth: strokeWidth,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": "true"
  }, paths[type] || paths.veg);
};
Object.assign(window, {
  IconLeaf,
  IconHeart,
  IconSeal,
  IconHouse,
  IconMap,
  IconCalendar,
  IconPot,
  IconCrosshair,
  IconSearch,
  IconMenu,
  IconInstagram,
  IconPhone,
  IconWhatsApp,
  CategoryLineArt
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "homepage/parts/icons.jsx", error: String((e && e.message) || e) }); }

// parts/App.jsx
try { (() => {
// ============================================================
// App — mounts every slot + drives the Tweaks panel.
// ============================================================

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "photo": "olive-oil",
  "mark": "olive",
  "accent": "serif-comma",
  "issue": "spine"
} /*EDITMODE-END*/;
function Slot({
  id,
  children
}) {
  const el = document.getElementById(id);
  if (!el) return null;
  return ReactDOM.createPortal(children, el);
}

// Card-wrapper listener: clicking anywhere on a mark comparison card
// applies that mark. Uses the React state setter passed in.
function MarkCardClickers({
  setKey,
  activeMark
}) {
  React.useEffect(() => {
    const kinds = ["wheat", "olive", "leaf"];
    const handlers = {};
    for (const k of kinds) {
      const card = document.getElementById(`mark-card-${k}`);
      if (!card) continue;
      handlers[k] = () => setKey("mark", k);
      card.addEventListener("click", handlers[k]);
      // Active outline
      card.style.outline = activeMark === k ? "2px solid var(--primary)" : "none";
      card.style.outlineOffset = "2px";
    }
    return () => {
      for (const k of kinds) {
        document.getElementById(`mark-card-${k}`)?.removeEventListener("click", handlers[k]);
      }
    };
  }, [setKey, activeMark]);
  return null;
}
function Mount() {
  const [state, setState] = React.useState(TWEAK_DEFAULTS);
  const [tweaksOpen, setTweaksOpen] = React.useState(false);
  React.useEffect(() => {
    try {
      const raw = localStorage.getItem("mehamakor_tweaks");
      if (raw) setState(s => ({
        ...s,
        ...JSON.parse(raw)
      }));
    } catch {}
  }, []);
  const setKey = React.useCallback((k, v) => {
    setState(s => {
      const next = {
        ...s,
        [k]: v
      };
      try {
        localStorage.setItem("mehamakor_tweaks", JSON.stringify(next));
      } catch {}
      try {
        window.parent?.postMessage({
          type: "__edit_mode_set_keys",
          edits: {
            [k]: v
          }
        }, "*");
      } catch {}
      return next;
    });
  }, []);
  React.useEffect(() => {
    const onMsg = e => {
      if (!e?.data) return;
      if (e.data.type === "__activate_edit_mode") setTweaksOpen(true);
      if (e.data.type === "__deactivate_edit_mode") setTweaksOpen(false);
    };
    window.addEventListener("message", onMsg);
    try {
      window.parent?.postMessage({
        type: "__edit_mode_available"
      }, "*");
    } catch {}
    return () => window.removeEventListener("message", onMsg);
  }, []);
  React.useEffect(() => {
    const el = document.getElementById("tweaks-panel");
    if (el) el.classList.toggle("visible", tweaksOpen);
  }, [tweaksOpen]);
  React.useEffect(() => {
    const close = () => setTweaksOpen(false);
    document.getElementById("tw-close")?.addEventListener("click", close);
    return () => document.getElementById("tw-close")?.removeEventListener("click", close);
  }, []);
  React.useEffect(() => {
    const groups = [{
      slot: "tw-photo",
      key: "photo",
      opts: [["olive-oil", "שמן זית"], ["cheese", "גבינות"], ["bread", "לחם מחמצת"], ["produce", "ירקות"]]
    }, {
      slot: "tw-mark",
      key: "mark",
      opts: [["wheat", "חיטה"], ["olive", "זית"], ["leaf", "עלה"]]
    }, {
      slot: "tw-accent",
      key: "accent",
      opts: [["serif-comma", "פסיק זהב"], ["green-period", "נקודה ירוקה"], ["olive-stop", "ענף קטן"]]
    }, {
      slot: "tw-issue",
      key: "issue",
      opts: [["spine", "שדרה"], ["none", "ללא"]]
    }];
    for (const g of groups) {
      const host = document.getElementById(g.slot);
      if (!host) continue;
      host.innerHTML = "";
      for (const [val, label] of g.opts) {
        const btn = document.createElement("button");
        btn.className = "opt" + (state[g.key] === val ? " active" : "");
        btn.textContent = label;
        btn.addEventListener("click", () => setKey(g.key, val));
        host.appendChild(btn);
      }
    }
  }, [state, setKey]);
  const mk = state.mark;
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(MarkCardClickers, {
    setKey: setKey,
    activeMark: mk
  }), /*#__PURE__*/React.createElement(Slot, {
    id: "mark-wheat-lg-slot"
  }, /*#__PURE__*/React.createElement(ActiveMark, {
    kind: "wheat",
    size: 88,
    strokeWidth: 1.2
  })), /*#__PURE__*/React.createElement(Slot, {
    id: "mark-wheat-hz-slot"
  }, /*#__PURE__*/React.createElement(LogoHorizontal, {
    height: 30,
    markKind: "wheat"
  })), /*#__PURE__*/React.createElement(Slot, {
    id: "mark-wheat-32-slot"
  }, /*#__PURE__*/React.createElement(ActiveMark, {
    kind: "wheat",
    size: 32,
    strokeWidth: 1.2
  })), /*#__PURE__*/React.createElement(Slot, {
    id: "mark-wheat-16-slot"
  }, /*#__PURE__*/React.createElement(ActiveMark, {
    kind: "wheat",
    size: 16,
    strokeWidth: 1.2
  })), /*#__PURE__*/React.createElement(Slot, {
    id: "mark-olive-lg-slot"
  }, /*#__PURE__*/React.createElement(ActiveMark, {
    kind: "olive",
    size: 88,
    strokeWidth: 1.2
  })), /*#__PURE__*/React.createElement(Slot, {
    id: "mark-olive-hz-slot"
  }, /*#__PURE__*/React.createElement(LogoHorizontal, {
    height: 30,
    markKind: "olive"
  })), /*#__PURE__*/React.createElement(Slot, {
    id: "mark-olive-32-slot"
  }, /*#__PURE__*/React.createElement(ActiveMark, {
    kind: "olive",
    size: 32,
    strokeWidth: 1.2
  })), /*#__PURE__*/React.createElement(Slot, {
    id: "mark-olive-16-slot"
  }, /*#__PURE__*/React.createElement(ActiveMark, {
    kind: "olive",
    size: 16,
    strokeWidth: 1.2
  })), /*#__PURE__*/React.createElement(Slot, {
    id: "mark-leaf-lg-slot"
  }, /*#__PURE__*/React.createElement(ActiveMark, {
    kind: "leaf",
    size: 88,
    strokeWidth: 1.2
  })), /*#__PURE__*/React.createElement(Slot, {
    id: "mark-leaf-hz-slot"
  }, /*#__PURE__*/React.createElement(LogoHorizontal, {
    height: 30,
    markKind: "leaf"
  })), /*#__PURE__*/React.createElement(Slot, {
    id: "mark-leaf-32-slot"
  }, /*#__PURE__*/React.createElement(ActiveMark, {
    kind: "leaf",
    size: 32,
    strokeWidth: 1.2
  })), /*#__PURE__*/React.createElement(Slot, {
    id: "mark-leaf-16-slot"
  }, /*#__PURE__*/React.createElement(ActiveMark, {
    kind: "leaf",
    size: 16,
    strokeWidth: 1.2
  })), /*#__PURE__*/React.createElement(Slot, {
    id: "logo-horizontal-slot"
  }, /*#__PURE__*/React.createElement(LogoHorizontal, {
    height: 40,
    markKind: mk
  })), /*#__PURE__*/React.createElement(Slot, {
    id: "logo-stacked-slot"
  }, /*#__PURE__*/React.createElement(LogoStacked, {
    size: 64,
    markKind: mk
  })), /*#__PURE__*/React.createElement(Slot, {
    id: "logo-monogram-lg-slot"
  }, /*#__PURE__*/React.createElement(LogoMonogram, {
    size: 72,
    markKind: mk
  })), /*#__PURE__*/React.createElement(Slot, {
    id: "logo-monogram-md-slot"
  }, /*#__PURE__*/React.createElement(LogoMonogram, {
    size: 40,
    markKind: mk
  })), /*#__PURE__*/React.createElement(Slot, {
    id: "logo-monogram-sm-slot"
  }, /*#__PURE__*/React.createElement(LogoMonogram, {
    size: 24,
    markKind: mk
  })), /*#__PURE__*/React.createElement(Slot, {
    id: "logo-inverse-slot"
  }, /*#__PURE__*/React.createElement(LogoInverse, {
    height: 40,
    markKind: mk
  })), /*#__PURE__*/React.createElement(Slot, {
    id: "hero-desktop-slot"
  }, /*#__PURE__*/React.createElement(HeroDesktop, {
    photoKey: state.photo,
    mark: mk,
    accent: state.accent,
    issue: state.issue
  })), /*#__PURE__*/React.createElement(Slot, {
    id: "hero-mobile-slot"
  }, /*#__PURE__*/React.createElement(HeroMobile, {
    photoKey: state.photo,
    accent: state.accent,
    markKind: mk
  })));
}
const mountRoot = document.createElement("div");
mountRoot.style.display = "none";
document.body.appendChild(mountRoot);
ReactDOM.createRoot(mountRoot).render(/*#__PURE__*/React.createElement(Mount, null));
})(); } catch (e) { __ds_ns.__errors.push({ path: "parts/App.jsx", error: String((e && e.message) || e) }); }

// parts/App2.jsx
try { (() => {
// ============================================================
// App2 — Session 2 preview scaffold.
// Mounts all card states + the category grid into slots.
// ============================================================

const DEMO = {
  miriam: {
    name: 'החווה של מרים',
    initials: 'ח · מ',
    img: 'https://images.unsplash.com/photo-1486297678162-eb2a19b0a32d?w=900&q=80',
    city: 'גליל עליון',
    distance: '4.2 km',
    description: 'גבינות עיזים בעירוי צלול, חלב גולמי טרי מהבוקר',
    price: 'מ-₪ 28 / 100 גרם',
    verified: true,
    saved: true,
    whatsapp: true,
    availability: 'available'
  },
  lehem: {
    name: 'לחם מרים',
    initials: 'ל · מ',
    city: 'תל אביב',
    distance: '1.8 km',
    description: 'מחמצת 48 שעות, קמח שיפון מלא, אופה ביום ראשון ורביעי',
    price: '₪ 42 / כיכר',
    isNew: true,
    whatsapp: true,
    availability: 'available'
  },
  shemen: {
    name: 'שמן מעיין זית',
    img: 'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=900&q=80',
    city: 'הגליל',
    distance: '12 km',
    description: 'כתית מעולה, סחיטה קרה, קטיף 2025',
    price: '₪ 78 / 500 מ״ל',
    verified: true,
    whatsapp: true
  },
  dvash: {
    name: 'דבש של יונית',
    img: 'https://images.unsplash.com/photo-1587049352846-4a222e784d38?w=900&q=80',
    city: 'רמת הגולן',
    distance: '28 km',
    description: 'דבש פרחי בר, כוורות על הרמה',
    price: '₪ 65 / 250 גרם',
    verified: true,
    whatsapp: true
  },
  beytsim: {
    name: 'החצר של אילן',
    initials: 'ה · א',
    city: 'עמק יזרעאל',
    distance: '8 km',
    description: 'ביצים חופשיות, תרנגולות חופש כל היום',
    price: '₪ 38 / תריסר',
    verified: true,
    whatsapp: true,
    availability: 'vacation'
  },
  yerakot: {
    name: 'משק אורלי',
    img: 'https://images.unsplash.com/photo-1540420773420-3366772f4999?w=900&q=80',
    city: 'הוד השרון',
    distance: '3.1 km',
    description: 'ירקות עונתיים, קטיף בוקר',
    price: 'סל ₪ 85',
    verified: true,
    isNew: true,
    whatsapp: true,
    availability: 'available'
  }
};

// Mount helpers
function mount(id, el) {
  const node = document.getElementById(id);
  if (node) ReactDOM.createRoot(node).render(el);
}

// ── Default (with image, verified, hover-off)
mount('pc-default', /*#__PURE__*/React.createElement(ProducerCard, {
  p: DEMO.miriam
}));

// ── Hover (forced)
mount('pc-hover', /*#__PURE__*/React.createElement(ProducerCard, {
  p: DEMO.shemen,
  forcedState: "hover"
}));

// ── Saved
mount('pc-saved', /*#__PURE__*/React.createElement(ProducerCard, {
  p: {
    ...DEMO.dvash,
    saved: true
  }
}));

// ── Selected
mount('pc-selected', /*#__PURE__*/React.createElement(ProducerCard, {
  p: DEMO.lehem,
  forcedState: "selected"
}));

// ── No image (placeholder)
mount('pc-placeholder', /*#__PURE__*/React.createElement(ProducerCard, {
  p: DEMO.beytsim
}));

// ── New badge
mount('pc-new', /*#__PURE__*/React.createElement(ProducerCard, {
  p: DEMO.yerakot
}));

// ── Loading skeleton
mount('pc-loading', /*#__PURE__*/React.createElement(ProducerCardSkeleton, null));

// ── Mobile (narrow)
mount('pc-mobile', /*#__PURE__*/React.createElement(ProducerCard, {
  p: DEMO.miriam,
  size: "mobile"
}));

// ── Category grid desktop
mount('cg-desktop', /*#__PURE__*/React.createElement(CategoryGrid2, {
  variant: "desktop"
}));

// ── Category grid mobile
mount('cg-mobile', /*#__PURE__*/React.createElement(CategoryGrid2, {
  variant: "mobile"
}));

// ============================================================
// Tweaks — optional surface controls for reviewing variations
// ============================================================
(function setupTweaks() {
  const TWEAKS = /*EDITMODE-BEGIN*/{
    "cardRadius": 16,
    "imageRatio": "4/3",
    "badgeStyle": "outline"
  } /*EDITMODE-END*/;
  const panel = document.getElementById('tweaks-panel');
  if (!panel) return;
  const applyRadius = r => {
    document.querySelectorAll('#pc-grid article, #pc-grid > div > article').forEach(n => {
      n.style.borderRadius = r + 'px';
    });
  };
  const applyRatio = ratio => {
    document.querySelectorAll('#pc-grid [style*="aspect-ratio"]').forEach(n => {
      if (n.querySelector('img') || n.querySelector('svg')) n.style.aspectRatio = ratio.replace('/', ' / ');
    });
  };
  function render() {
    panel.querySelector('[data-tw="radius"]').innerHTML = [8, 12, 16, 20].map(r => `<button class="opt ${TWEAKS.cardRadius === r ? 'active' : ''}" data-r="${r}">${r}px</button>`).join('');
    panel.querySelector('[data-tw="ratio"]').innerHTML = ['4/3', '1/1', '3/2'].map(r => `<button class="opt ${TWEAKS.imageRatio === r ? 'active' : ''}" data-ratio="${r}">${r}</button>`).join('');
  }
  render();
  panel.addEventListener('click', e => {
    const b = e.target.closest('.opt');
    if (!b) return;
    if (b.dataset.r) {
      TWEAKS.cardRadius = +b.dataset.r;
      applyRadius(TWEAKS.cardRadius);
    }
    if (b.dataset.ratio) {
      TWEAKS.imageRatio = b.dataset.ratio;
      applyRatio(TWEAKS.imageRatio);
    }
    render();
    window.parent.postMessage({
      type: '__edit_mode_set_keys',
      edits: TWEAKS
    }, '*');
  });
  window.addEventListener('message', ev => {
    if (ev.data?.type === '__activate_edit_mode') panel.classList.add('visible');
    if (ev.data?.type === '__deactivate_edit_mode') panel.classList.remove('visible');
  });
  window.parent.postMessage({
    type: '__edit_mode_available'
  }, '*');
  document.getElementById('tw-close')?.addEventListener('click', () => {
    panel.classList.remove('visible');
  });
})();
})(); } catch (e) { __ds_ns.__errors.push({ path: "parts/App2.jsx", error: String((e && e.message) || e) }); }

// parts/CategoryGrid2.jsx
try { (() => {
// ============================================================
// CategoryGrid — Session 2
// Asymmetric 3-column magazine layout on desktop.
// Vertical stack on mobile. Hover: image tints warm, label fades,
// a 1-line English subtitle fades in.
// ============================================================

const CATEGORIES_2 = [{
  key: 'veg',
  name: 'ירקות, פירות ומשקים',
  en: 'vegetables, fruit & ferments',
  img: 'https://images.unsplash.com/photo-1540420773420-3366772f4999?w=1200&q=80',
  size: 'hero'
}, {
  key: 'bread',
  name: 'לחמים ואפייה',
  en: 'breads & baking',
  img: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=800&q=80',
  size: 'tall'
}, {
  key: 'dairy',
  name: 'חלב וגבינות',
  en: 'dairy & cheese',
  img: 'https://images.unsplash.com/photo-1559561853-08451507cbe7?w=800&q=80',
  size: 'wide'
}, {
  key: 'oil',
  name: 'שמנים ודבש',
  en: 'oils & honey',
  img: 'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=800&q=80',
  size: 'wide'
}, {
  key: 'meat',
  name: 'בשר, עוף ודגים',
  en: 'meat, poultry & fish',
  img: 'https://images.unsplash.com/photo-1607623814075-e51df1bdc82f?w=800&q=80',
  size: 'wide'
}, {
  key: 'care',
  name: 'טיפוח וסבונים',
  en: 'botanicals & care',
  img: 'https://images.unsplash.com/photo-1600857544200-b2f666a9a2ec?w=800&q=80',
  size: 'wide'
}];

// Desktop layout: 3 cols. col-1 = hero (rows 1-2, 2 rows tall). col-2 = tall (rows 1-2). col-3 row-1 = wide. col-3 row-2 = wide. Then row 3 = 3 wides.
// Simplified to an editorial asymmetric pattern with explicit grid-area per card.
const GRID_AREAS = {
  veg: {
    gridColumn: '1 / 2',
    gridRow: '1 / 3'
  },
  // hero – tall on the right in RTL (col 1 = rightmost)
  bread: {
    gridColumn: '2 / 3',
    gridRow: '1 / 3'
  },
  dairy: {
    gridColumn: '3 / 4',
    gridRow: '1 / 2'
  },
  oil: {
    gridColumn: '3 / 4',
    gridRow: '2 / 3'
  },
  meat: {
    gridColumn: '1 / 3',
    gridRow: '3 / 4'
  },
  care: {
    gridColumn: '3 / 4',
    gridRow: '3 / 4'
  }
};
function CategoryCard({
  c,
  idx,
  variant = 'desktop'
}) {
  const [hover, setHover] = React.useState(false);
  const mobile = variant === 'mobile';
  return /*#__PURE__*/React.createElement("a", {
    href: "#",
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false),
    style: {
      position: 'relative',
      display: 'block',
      borderRadius: 16,
      overflow: 'hidden',
      textDecoration: 'none',
      cursor: 'pointer',
      background: '#2E4A2E',
      aspectRatio: mobile ? '16 / 10' : 'auto',
      minHeight: mobile ? 180 : 0,
      height: mobile ? 'auto' : '100%',
      ...(!mobile && GRID_AREAS[c.key]),
      transition: 'transform .35s var(--ease-out)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      background: `url(${c.img}) center/cover`,
      transition: 'transform .6s var(--ease-out), filter .35s ease',
      transform: hover ? 'scale(1.04)' : 'scale(1)',
      filter: hover ? 'saturate(0.85)' : 'saturate(1)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      background: '#8B6914',
      mixBlendMode: 'multiply',
      opacity: hover ? 0.28 : 0,
      transition: 'opacity .35s var(--ease-out)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      background: 'linear-gradient(to top, rgba(28,26,23,0.72) 0%, rgba(28,26,23,0.22) 45%, rgba(28,26,23,0) 70%)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: 18,
      insetInlineEnd: 20,
      fontFamily: 'var(--font-english)',
      fontStyle: 'italic',
      fontWeight: 600,
      fontSize: 22,
      color: 'rgba(245,240,232,0.9)',
      letterSpacing: '0.05em'
    }
  }, "No. ", String(idx + 1).padStart(2, '0')), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      bottom: 22,
      insetInlineStart: 22,
      insetInlineEnd: 22,
      color: '#F5F0E8'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-english)',
      fontStyle: 'italic',
      fontSize: 13,
      fontWeight: 500,
      color: 'rgba(245,240,232,0.78)',
      letterSpacing: '0.03em',
      marginBottom: 4,
      opacity: hover ? 1 : 0.55,
      transform: hover ? 'translateY(0)' : 'translateY(4px)',
      transition: 'opacity .3s ease, transform .3s var(--ease-out)'
    }
  }, "\u2014 ", c.en), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-headline)',
      fontWeight: 700,
      fontSize: mobile ? 22 : c.key === 'veg' ? 34 : 24,
      lineHeight: 1.05,
      letterSpacing: '-0.01em'
    }
  }, c.name), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      marginTop: 14,
      opacity: hover ? 1 : 0,
      transform: hover ? 'translateX(0)' : 'translateX(8px)',
      transition: 'opacity .35s ease, transform .35s var(--ease-out)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 36,
      height: 1,
      background: '#F5F0E8'
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-body)',
      fontSize: 12,
      fontWeight: 500,
      letterSpacing: '0.12em',
      textTransform: 'uppercase'
    }
  }, "\u05D2\u05DC\u05D9 \u2190"))));
}
function CategoryGrid2({
  variant = 'desktop'
}) {
  if (variant === 'mobile') {
    return /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        padding: '0 16px'
      }
    }, CATEGORIES_2.map((c, i) => /*#__PURE__*/React.createElement(CategoryCard, {
      key: c.key,
      c: c,
      idx: i,
      variant: "mobile"
    })));
  }
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(3, 1fr)',
      gridTemplateRows: '220px 200px 240px',
      gap: 14,
      padding: '0 32px'
    }
  }, CATEGORIES_2.map((c, i) => /*#__PURE__*/React.createElement(CategoryCard, {
    key: c.key,
    c: c,
    idx: i,
    variant: "desktop"
  })));
}
Object.assign(window, {
  CategoryGrid2,
  CATEGORIES_2
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "parts/CategoryGrid2.jsx", error: String((e && e.message) || e) }); }

// parts/HeroDesktop.jsx
try { (() => {
// ============================================================
// HERO — DESKTOP (1440px)
//
// Asymmetric 60/40 split. Cream panel on the start-side (RTL =
// right). Full-bleed food photograph on the end-side. A vertical
// "ISSUE 01 · SPRING 2026" spine runs up the gutter between them,
// like a magazine spine. The wordmark is NOT in the logo slot —
// it IS the headline, set at masthead scale.
// ============================================================

const HERO_PHOTOS = {
  // Each option is a single, intentional photograph — not a mood board.
  // Chosen for: warm light, single subject, shallow depth, human scale.
  "olive-oil": {
    url: "https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=1400&auto=format&q=85&fm=webp",
    caption: "שמן זית כתית, הגליל העליון",
    credit: "Naftali Heights · press release"
  },
  "cheese": {
    url: "https://images.unsplash.com/photo-1486297678162-eb2a19b0a32d?w=1400&auto=format&q=85&fm=webp",
    caption: "גבינות עיזים, מחלבת החווה",
    credit: "חוות מרים · גליל תחתון"
  },
  "bread": {
    url: "https://images.unsplash.com/photo-1549931319-a545dcf3bc73?w=1400&auto=format&q=85&fm=webp",
    caption: "לחם מחמצת ביתי, יום ששי",
    credit: "המאפייה של שירה · תל אביב"
  },
  "produce": {
    url: "https://images.unsplash.com/photo-1542838132-92c53300491e?w=1400&auto=format&q=85&fm=webp",
    caption: "ירקות העונה, השוק השכונתי",
    credit: "שוק האיכרים · ירושלים"
  }
};
function HeroDesktop({
  photoKey = "olive-oil",
  mark = "olive",
  accent = "serif-comma",
  issue = "spine"
}) {
  const photo = HERO_PHOTOS[photoKey] || HERO_PHOTOS["olive-oil"];
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: "relative",
      background: "var(--bg)",
      minHeight: 760,
      overflow: "hidden"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: "relative",
      zIndex: 3,
      display: "grid",
      gridTemplateColumns: "1fr auto 1fr",
      alignItems: "center",
      padding: "20px 40px",
      borderBottom: "1px solid var(--border)",
      direction: "rtl"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      justifySelf: "start"
    }
  }, /*#__PURE__*/React.createElement(LogoHorizontal, {
    height: 28,
    markKind: mark
  })), /*#__PURE__*/React.createElement("nav", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 36,
      fontFamily: "var(--font-body)",
      fontSize: 14,
      fontWeight: 500,
      color: "var(--fg)",
      justifySelf: "center"
    }
  }, /*#__PURE__*/React.createElement("a", {
    href: "#",
    style: navLinkStyle
  }, "\u05E2\u05E1\u05E7\u05D9\u05DD"), /*#__PURE__*/React.createElement("a", {
    href: "#",
    style: navLinkStyle
  }, "\u05DE\u05E4\u05D4"), /*#__PURE__*/React.createElement("a", {
    href: "#",
    style: navLinkStyle
  }, "\u05E7\u05D8\u05D2\u05D5\u05E8\u05D9\u05D5\u05EA"), /*#__PURE__*/React.createElement("a", {
    href: "#",
    style: navLinkStyle
  }, "\u05D0\u05D9\u05E8\u05D5\u05E2\u05D9\u05DD")), /*#__PURE__*/React.createElement("div", {
    style: {
      justifySelf: "end"
    }
  }, /*#__PURE__*/React.createElement("a", {
    href: "#",
    style: {
      display: "inline-flex",
      alignItems: "center",
      padding: "9px 18px",
      border: "1px solid #1C1A17",
      borderRadius: 6,
      color: "#1C1A17",
      fontFamily: "var(--font-body)",
      fontSize: 13,
      fontWeight: 600,
      letterSpacing: "0.02em",
      textDecoration: "none",
      background: "transparent",
      minHeight: 40,
      transition: "background 200ms var(--ease-out), color 200ms var(--ease-out)"
    },
    onMouseEnter: e => {
      e.currentTarget.style.background = "#1C1A17";
      e.currentTarget.style.color = "var(--bg)";
    },
    onMouseLeave: e => {
      e.currentTarget.style.background = "transparent";
      e.currentTarget.style.color = "#1C1A17";
    }
  }, "\u05D4\u05D5\u05E1\u05D9\u05E4\u05D9 \u05E2\u05E1\u05E7"))), /*#__PURE__*/React.createElement("div", {
    style: {
      position: "relative",
      display: "grid",
      gridTemplateColumns: "60fr 40fr",
      minHeight: 700
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: "relative",
      padding: "88px 80px 64px 88px",
      display: "flex",
      flexDirection: "column",
      justifyContent: "center"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 14,
      marginBottom: 40
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-body)",
      fontWeight: 500,
      fontSize: 11,
      letterSpacing: "0.18em",
      textTransform: "uppercase",
      color: "var(--accent)"
    }
  }, "DIRECTORY"), /*#__PURE__*/React.createElement("span", {
    style: {
      width: 28,
      height: 1,
      background: "var(--accent)",
      opacity: 0.5
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-body)",
      fontWeight: 500,
      fontSize: 11,
      letterSpacing: "0.18em",
      textTransform: "uppercase",
      color: "var(--fg-muted)"
    }
  }, "\u05D2\u05DC\u05D9\u05DC \xB7 \u05EA\u05DC \u05D0\u05D1\u05D9\u05D1 \xB7 \u05D9\u05E8\u05D5\u05E9\u05DC\u05D9\u05DD")), /*#__PURE__*/React.createElement("h1", {
    style: {
      fontFamily: "var(--font-headline)",
      fontWeight: 900,
      fontSize: "clamp(56px, 6vw, 92px)",
      lineHeight: 0.94,
      letterSpacing: "-0.025em",
      color: "var(--fg)",
      margin: 0,
      textAlign: "start",
      maxWidth: 640
    }
  }, "\u05D0\u05D5\u05DB\u05DC \u05D0\u05DE\u05D9\u05EA\u05D9,", /*#__PURE__*/React.createElement("br", null), "\u05D9\u05E9\u05E8 \u05DE\u05D4\u05DE\u05E7\u05D5\u05E8", accent === "serif-comma" && /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-english)",
      fontStyle: "italic",
      fontWeight: 600,
      color: "var(--accent)",
      fontSize: "0.82em",
      letterSpacing: "-0.01em"
    }
  }, "."), accent === "green-period" && /*#__PURE__*/React.createElement("span", {
    style: {
      color: "var(--primary)"
    }
  }, "."), accent === "olive-stop" && /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-block",
      verticalAlign: "baseline",
      marginInlineStart: 6,
      color: "var(--primary)",
      transform: "translateY(0.08em)"
    }
  }, /*#__PURE__*/React.createElement(OliveBranch, {
    size: 32,
    strokeWidth: 1.4
  }))), /*#__PURE__*/React.createElement("p", {
    style: {
      fontFamily: "var(--font-body)",
      fontWeight: 400,
      fontSize: 18,
      lineHeight: 1.55,
      color: "var(--fg-muted)",
      margin: "28px 0 40px",
      maxWidth: 480
    }
  }, "\u05DE\u05E6\u05D0\u05D9 \u05D0\u05EA \u05D1\u05D9\u05EA \u05D4\u05E2\u05E1\u05E7 \u05D4\u05E7\u05E8\u05D5\u05D1 \u05D0\u05DC\u05D9\u05D9\u05DA \u2014 \u05D4\u05D7\u05E7\u05DC\u05D0\u05D9\u05EA, \u05D4\u05D0\u05D5\u05E4\u05D4, \u05D4\u05E9\u05DB\u05E0\u05D4 \u05E9\u05DE\u05D1\u05E9\u05DC\u05EA.", " ", /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-english)",
      fontStyle: "italic",
      fontWeight: 500,
      color: "var(--fg)"
    }
  }, "\u05D9\u05E9\u05D9\u05E8\u05D5\u05EA"), " ", "\u05D1\u05D5\u05D5\u05D0\u05D8\u05E1\u05D0\u05E4. \u05D1\u05DC\u05D9 \u05DE\u05EA\u05D5\u05D5\u05DB\u05D9\u05DD."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 12,
      alignItems: "center",
      flexWrap: "wrap"
    }
  }, /*#__PURE__*/React.createElement("button", {
    style: {
      background: "var(--fg)",
      color: "var(--bg)",
      border: "1px solid var(--fg)",
      padding: "14px 28px",
      borderRadius: 6,
      fontFamily: "var(--font-body)",
      fontWeight: 600,
      fontSize: 14,
      letterSpacing: "0.03em",
      cursor: "pointer",
      minHeight: 48,
      display: "inline-flex",
      alignItems: "center",
      gap: 10,
      transition: "transform 300ms var(--ease-out), background 300ms var(--ease-out)"
    },
    onMouseEnter: e => {
      e.currentTarget.style.background = "var(--primary-dark)";
    },
    onMouseLeave: e => {
      e.currentTarget.style.background = "var(--fg)";
    }
  }, "\u05D2\u05DC\u05D9 \u05E2\u05E1\u05E7\u05D9\u05DD \u05E7\u05E8\u05D5\u05D1\u05D9\u05DD", /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-english)",
      fontSize: 16,
      transform: "translateY(-1px)"
    }
  }, "\u2190")), /*#__PURE__*/React.createElement("button", {
    style: {
      background: "transparent",
      color: "var(--fg)",
      border: "1px solid var(--fg)",
      padding: "14px 28px",
      borderRadius: 6,
      fontFamily: "var(--font-body)",
      fontWeight: 600,
      fontSize: 14,
      letterSpacing: "0.03em",
      cursor: "pointer",
      minHeight: 48,
      transition: "background 300ms var(--ease-out), color 300ms var(--ease-out)"
    },
    onMouseEnter: e => {
      e.currentTarget.style.background = "var(--fg)";
      e.currentTarget.style.color = "var(--bg)";
    },
    onMouseLeave: e => {
      e.currentTarget.style.background = "transparent";
      e.currentTarget.style.color = "var(--fg)";
    }
  }, "\u05D0\u05D9\u05DA \u05D6\u05D4 \u05E2\u05D5\u05D1\u05D3")), /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      bottom: 40,
      insetInlineEnd: 40,
      display: "flex",
      alignItems: "center",
      gap: 12,
      color: "var(--fg-muted)"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-body)",
      fontWeight: 500,
      fontSize: 11,
      letterSpacing: "0.18em",
      textTransform: "uppercase"
    }
  }, "\u05D2\u05DC\u05DC\u05D9"), /*#__PURE__*/React.createElement("span", {
    className: "scroll-glide",
    style: {
      display: "inline-block",
      width: 1,
      height: 40,
      background: "currentColor",
      opacity: 0.4,
      transformOrigin: "top"
    }
  }))), issue === "spine" && /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      insetInlineStart: "calc(60% - 28px)",
      top: 88,
      bottom: 88,
      width: 56,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "space-between",
      pointerEvents: "none",
      zIndex: 2
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      writingMode: "vertical-rl",
      transform: "rotate(180deg)",
      fontFamily: "var(--font-english)",
      fontStyle: "italic",
      fontWeight: 600,
      fontSize: 13,
      letterSpacing: "0.22em",
      color: "var(--accent)",
      textTransform: "uppercase"
    }
  }, "Issue 01 \u2014 Spring 2026"), /*#__PURE__*/React.createElement("div", {
    style: {
      width: 1,
      flex: 1,
      margin: "14px 0",
      background: "var(--border)"
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      writingMode: "vertical-rl",
      transform: "rotate(180deg)",
      fontFamily: "var(--font-body)",
      fontWeight: 500,
      fontSize: 11,
      letterSpacing: "0.24em",
      textTransform: "uppercase",
      color: "var(--fg-muted)"
    }
  }, "mehamakor.online")), /*#__PURE__*/React.createElement("div", {
    style: {
      position: "relative",
      background: "#2a2520",
      overflow: "hidden"
    }
  }, /*#__PURE__*/React.createElement("div", {
    key: photoKey,
    className: "kenburns",
    style: {
      position: "absolute",
      inset: "-4%",
      backgroundImage: `url(${photo.url})`,
      backgroundSize: "cover",
      backgroundPosition: "center"
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      bottom: 32,
      insetInlineStart: 32,
      insetInlineEnd: 32,
      color: "#fff",
      display: "flex",
      flexDirection: "column",
      gap: 6,
      textShadow: "0 1px 14px rgba(0,0,0,0.35)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--font-body)",
      fontWeight: 500,
      fontSize: 10,
      letterSpacing: "0.22em",
      textTransform: "uppercase",
      opacity: 0.82
    }
  }, "Featured \xB7 \u05D4\u05E9\u05D1\u05D5\u05E2"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--font-headline)",
      fontWeight: 700,
      fontSize: 20,
      lineHeight: 1.3
    }
  }, photo.caption), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--font-english)",
      fontStyle: "italic",
      fontWeight: 500,
      fontSize: 13,
      opacity: 0.78
    }
  }, photo.credit)), /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      top: 32,
      insetInlineStart: 32,
      fontFamily: "var(--font-english)",
      fontStyle: "italic",
      fontWeight: 600,
      fontSize: 15,
      letterSpacing: "0.1em",
      color: "#fff",
      opacity: 0.82
    }
  }, "\u2116 001"))), /*#__PURE__*/React.createElement("div", {
    style: {
      background: "var(--primary)",
      color: "var(--bg)",
      height: 52,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontFamily: "var(--font-body)",
      fontWeight: 500,
      fontSize: 14,
      letterSpacing: "0.02em"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 18
    }
  }, /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement("strong", {
    style: {
      fontWeight: 700
    }
  }, "247"), " \u05D1\u05EA\u05D9 \u05E2\u05E1\u05E7 \u05DE\u05D0\u05D5\u05DE\u05EA\u05D9\u05DD"), /*#__PURE__*/React.createElement("span", {
    style: {
      opacity: 0.55
    }
  }, "\xB7"), /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement("strong", {
    style: {
      fontWeight: 700
    }
  }, "12"), " \u05E7\u05D8\u05D2\u05D5\u05E8\u05D9\u05D5\u05EA"), /*#__PURE__*/React.createElement("span", {
    style: {
      opacity: 0.55
    }
  }, "\xB7"), /*#__PURE__*/React.createElement("span", null, "\u05DE\u05DB\u05DC \u05E8\u05D7\u05D1\u05D9 \u05D4\u05D0\u05E8\u05E5"))), /*#__PURE__*/React.createElement("style", null, `
        @keyframes heroKenBurns {
          0%   { transform: scale(1)    translate(0,0); }
          100% { transform: scale(1.04) translate(-1.2%, -0.8%); }
        }
        .kenburns { animation: heroKenBurns 20s ease-in-out infinite alternate; }
        @keyframes scrollGlide {
          0%, 100% { transform: scaleY(0.2); opacity: 0.2; transform-origin: top; }
          50%      { transform: scaleY(1);   opacity: 0.6; transform-origin: top; }
        }
        .scroll-glide { animation: scrollGlide 2.4s cubic-bezier(0.25, 1, 0.5, 1) infinite; }
        @media (prefers-reduced-motion: reduce) {
          .kenburns, .scroll-glide { animation: none !important; }
        }
      `));
}
const navLinkStyle = {
  color: "var(--fg)",
  textDecoration: "none",
  transition: "color 180ms var(--ease-out)"
};
window.HeroDesktop = HeroDesktop;
window.HERO_PHOTOS = HERO_PHOTOS;
})(); } catch (e) { __ds_ns.__errors.push({ path: "parts/HeroDesktop.jsx", error: String((e && e.message) || e) }); }

// parts/HeroMobile.jsx
try { (() => {
// ============================================================
// HERO — MOBILE (390px iPhone)
//
// Photograph sits on top (45svh). Cream panel below with the
// wordmark overlapping the image's lower edge like a poster.
// Same editorial DNA, compressed: eyebrow, masthead headline,
// sub-line, two stacked CTAs, trust bar. No search.
// ============================================================

function HeroMobile({
  photoKey = "olive-oil",
  accent = "serif-comma",
  markKind = "olive"
}) {
  const photo = window.HERO_PHOTOS[photoKey] || window.HERO_PHOTOS["olive-oil"];
  return /*#__PURE__*/React.createElement("div", {
    style: {
      height: "100%",
      width: "100%",
      background: "var(--bg)",
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
      position: "relative"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      height: 44,
      flexShrink: 0,
      display: "flex",
      alignItems: "flex-end",
      justifyContent: "space-between",
      padding: "0 22px 6px",
      fontFamily: "var(--font-body)",
      fontWeight: 600,
      fontSize: 13,
      color: "var(--fg)"
    }
  }, /*#__PURE__*/React.createElement("span", null, "9:41"), /*#__PURE__*/React.createElement("span", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 5
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "17",
    height: "10",
    viewBox: "0 0 17 10",
    fill: "currentColor"
  }, /*#__PURE__*/React.createElement("rect", {
    x: "0",
    y: "4",
    width: "3",
    height: "6",
    rx: "0.6"
  }), /*#__PURE__*/React.createElement("rect", {
    x: "5",
    y: "2",
    width: "3",
    height: "8",
    rx: "0.6"
  }), /*#__PURE__*/React.createElement("rect", {
    x: "10",
    y: "0",
    width: "3",
    height: "10",
    rx: "0.6"
  })), /*#__PURE__*/React.createElement("svg", {
    width: "15",
    height: "10",
    viewBox: "0 0 15 10",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.2"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M1 5 C 4 1, 11 1, 14 5"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M3 7 C 5 4, 10 4, 12 7"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "7.5",
    cy: "8.5",
    r: "1",
    fill: "currentColor",
    stroke: "none"
  })), /*#__PURE__*/React.createElement("svg", {
    width: "22",
    height: "10",
    viewBox: "0 0 22 10",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1"
  }, /*#__PURE__*/React.createElement("rect", {
    x: "0.5",
    y: "0.5",
    width: "18",
    height: "9",
    rx: "2"
  }), /*#__PURE__*/React.createElement("rect", {
    x: "2",
    y: "2",
    width: "15",
    height: "6",
    rx: "1",
    fill: "currentColor"
  }), /*#__PURE__*/React.createElement("rect", {
    x: "19.5",
    y: "3.5",
    width: "1.5",
    height: "3",
    rx: "0.5",
    fill: "currentColor"
  })))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "10px 20px 14px",
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement(LogoHorizontal, {
    height: 20,
    markKind: markKind
  }), /*#__PURE__*/React.createElement("button", {
    "aria-label": "\u05EA\u05E4\u05E8\u05D9\u05D8",
    style: {
      background: "transparent",
      border: "none",
      padding: 6,
      cursor: "pointer",
      color: "var(--fg)"
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "22",
    height: "22",
    viewBox: "0 0 22 22",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.6",
    strokeLinecap: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M3 6h16M3 11h16M3 16h16"
  })))), /*#__PURE__*/React.createElement("div", {
    style: {
      position: "relative",
      height: 300,
      flexShrink: 0,
      marginInline: 20,
      borderRadius: 12,
      overflow: "hidden",
      background: "#2a2520"
    }
  }, /*#__PURE__*/React.createElement("div", {
    key: photoKey,
    className: "kenburns-m",
    style: {
      position: "absolute",
      inset: "-4%",
      backgroundImage: `url(${photo.url})`,
      backgroundSize: "cover",
      backgroundPosition: "center"
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      top: 14,
      insetInlineStart: 14,
      fontFamily: "var(--font-english)",
      fontStyle: "italic",
      fontWeight: 600,
      fontSize: 12,
      letterSpacing: "0.1em",
      color: "#fff",
      opacity: 0.85
    }
  }, "\u2116 001"), /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      bottom: 12,
      insetInlineStart: 14,
      insetInlineEnd: 14,
      color: "#fff",
      textShadow: "0 1px 10px rgba(0,0,0,0.4)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--font-body)",
      fontWeight: 500,
      fontSize: 9,
      letterSpacing: "0.2em",
      textTransform: "uppercase",
      opacity: 0.85,
      marginBottom: 2
    }
  }, "Featured \xB7 \u05D4\u05E9\u05D1\u05D5\u05E2"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--font-headline)",
      fontWeight: 700,
      fontSize: 15,
      lineHeight: 1.3
    }
  }, photo.caption))), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minHeight: 0,
      padding: "22px 20px 0",
      display: "flex",
      flexDirection: "column",
      position: "relative"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 10,
      marginBottom: 16
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-body)",
      fontWeight: 500,
      fontSize: 10,
      letterSpacing: "0.18em",
      textTransform: "uppercase",
      color: "var(--accent)"
    }
  }, "Issue 01"), /*#__PURE__*/React.createElement("span", {
    style: {
      width: 18,
      height: 1,
      background: "var(--accent)",
      opacity: 0.5
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-body)",
      fontWeight: 500,
      fontSize: 10,
      letterSpacing: "0.18em",
      textTransform: "uppercase",
      color: "var(--fg-muted)"
    }
  }, "\u05D0\u05D1\u05D9\u05D1 2026")), /*#__PURE__*/React.createElement("h1", {
    style: {
      fontFamily: "var(--font-headline)",
      fontWeight: 900,
      fontSize: 48,
      lineHeight: 0.94,
      letterSpacing: "-0.025em",
      color: "var(--fg)",
      margin: 0,
      textAlign: "start"
    }
  }, "\u05D0\u05D5\u05DB\u05DC \u05D0\u05DE\u05D9\u05EA\u05D9,", /*#__PURE__*/React.createElement("br", null), "\u05D9\u05E9\u05E8 \u05DE\u05D4\u05DE\u05E7\u05D5\u05E8", accent === "serif-comma" && /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-english)",
      fontStyle: "italic",
      fontWeight: 600,
      color: "var(--accent)",
      fontSize: "0.82em"
    }
  }, "."), accent === "green-period" && /*#__PURE__*/React.createElement("span", {
    style: {
      color: "var(--primary)"
    }
  }, "."), accent === "olive-stop" && /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-block",
      marginInlineStart: 4,
      color: "var(--primary)",
      transform: "translateY(0.1em)"
    }
  }, /*#__PURE__*/React.createElement(OliveBranch, {
    size: 22,
    strokeWidth: 1.5
  }))), /*#__PURE__*/React.createElement("p", {
    style: {
      fontFamily: "var(--font-body)",
      fontSize: 15,
      lineHeight: 1.5,
      color: "var(--fg-muted)",
      margin: "14px 0 20px"
    }
  }, "\u05DE\u05E6\u05D0\u05D9 \u05D0\u05EA \u05D1\u05D9\u05EA \u05D4\u05E2\u05E1\u05E7 \u05D4\u05E7\u05E8\u05D5\u05D1 \u05D0\u05DC\u05D9\u05D9\u05DA \u2014 \u05D1\u05DC\u05D9 \u05DE\u05EA\u05D5\u05D5\u05DB\u05D9\u05DD."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 10
    }
  }, /*#__PURE__*/React.createElement("button", {
    style: {
      background: "var(--fg)",
      color: "var(--bg)",
      border: "1px solid var(--fg)",
      padding: "14px 20px",
      borderRadius: 6,
      fontFamily: "var(--font-body)",
      fontWeight: 600,
      fontSize: 14,
      letterSpacing: "0.03em",
      cursor: "pointer",
      minHeight: 48,
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 10,
      width: "100%"
    }
  }, "\u05D2\u05DC\u05D9 \u05E2\u05E1\u05E7\u05D9\u05DD \u05E7\u05E8\u05D5\u05D1\u05D9\u05DD", /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-english)",
      fontSize: 16
    }
  }, "\u2190")), /*#__PURE__*/React.createElement("button", {
    style: {
      background: "transparent",
      color: "var(--fg)",
      border: "1px solid var(--fg)",
      padding: "14px 20px",
      borderRadius: 6,
      fontFamily: "var(--font-body)",
      fontWeight: 600,
      fontSize: 14,
      letterSpacing: "0.03em",
      cursor: "pointer",
      minHeight: 48,
      width: "100%"
    }
  }, "\u05D0\u05D9\u05DA \u05D6\u05D4 \u05E2\u05D5\u05D1\u05D3")), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      marginInline: -20,
      background: "var(--primary)",
      color: "var(--bg)",
      padding: "14px 20px",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 12,
      fontFamily: "var(--font-body)",
      fontWeight: 500,
      fontSize: 12
    }
  }, /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement("strong", {
    style: {
      fontWeight: 700
    }
  }, "247"), " \u05E2\u05E1\u05E7\u05D9\u05DD"), /*#__PURE__*/React.createElement("span", {
    style: {
      opacity: 0.55
    }
  }, "\xB7"), /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement("strong", {
    style: {
      fontWeight: 700
    }
  }, "12"), " \u05E7\u05D8\u05D2\u05D5\u05E8\u05D9\u05D5\u05EA"), /*#__PURE__*/React.createElement("span", {
    style: {
      opacity: 0.55
    }
  }, "\xB7"), /*#__PURE__*/React.createElement("span", null, "\u05DB\u05DC \u05D4\u05D0\u05E8\u05E5"))), /*#__PURE__*/React.createElement("style", null, `
        @keyframes heroKenBurnsM {
          0%   { transform: scale(1)    translate(0,0); }
          100% { transform: scale(1.05) translate(-1.5%, -1%); }
        }
        .kenburns-m { animation: heroKenBurnsM 20s ease-in-out infinite alternate; }
      `));
}
window.HeroMobile = HeroMobile;
})(); } catch (e) { __ds_ns.__errors.push({ path: "parts/HeroMobile.jsx", error: String((e && e.message) || e) }); }

// parts/Icons2.jsx
try { (() => {
// Session 2 — icon set (Phosphor-style SVGs, inline)
// Duotone-ish warmth via stroke + selective fill.

function IconHeart({
  size = 20,
  filled = false,
  color = "currentColor"
}) {
  return filled ? /*#__PURE__*/React.createElement("svg", {
    width: size,
    height: size,
    viewBox: "0 0 256 256",
    fill: color,
    "aria-hidden": "true"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M240 98c0 78-104 134-108 136a8 8 0 0 1-8 0C120 232 16 176 16 98a62 62 0 0 1 112-36 62 62 0 0 1 112 36Z"
  })) : /*#__PURE__*/React.createElement("svg", {
    width: size,
    height: size,
    viewBox: "0 0 256 256",
    fill: "none",
    stroke: color,
    strokeWidth: "14",
    strokeLinejoin: "round",
    "aria-hidden": "true"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M240 98c0 78-104 134-108 136a8 8 0 0 1-8 0C120 232 16 176 16 98a62 62 0 0 1 112-36 62 62 0 0 1 112 36Z"
  }));
}
function IconCheck({
  size = 12,
  color = "currentColor"
}) {
  return /*#__PURE__*/React.createElement("svg", {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: color,
    "aria-hidden": "true"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z"
  }));
}
function IconWhatsApp({
  size = 18,
  color = "#25D366"
}) {
  return /*#__PURE__*/React.createElement("svg", {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: color,
    "aria-hidden": "true"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M20.5 3.5A11.9 11.9 0 0012 0C5.5 0 .1 5.35.1 11.94c0 2.1.55 4.15 1.6 5.96L0 24l6.27-1.64a11.9 11.9 0 005.77 1.47C18.63 23.83 24 18.5 24 12a11.9 11.9 0 00-3.5-8.5zM12 21.82a9.9 9.9 0 01-5.04-1.37l-.36-.22-3.72.97.99-3.62-.23-.37A9.86 9.86 0 012.15 12C2.15 6.58 6.58 2.16 12 2.16c2.62 0 5.08 1.02 6.93 2.87A9.77 9.77 0 0121.85 12c0 5.42-4.43 9.82-9.85 9.82zm5.42-7.35c-.3-.15-1.76-.86-2.04-.96-.27-.1-.47-.15-.67.15s-.77.96-.95 1.16c-.17.2-.35.22-.65.07-.3-.15-1.25-.46-2.38-1.46-.88-.78-1.47-1.75-1.64-2.05-.17-.3-.02-.46.13-.6.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.61-.92-2.2-.24-.58-.48-.5-.67-.51l-.57-.01a1.1 1.1 0 00-.8.37c-.27.3-1.05 1.03-1.05 2.5s1.07 2.9 1.22 3.1c.15.2 2.1 3.2 5.08 4.49.71.3 1.26.48 1.69.62.71.22 1.36.19 1.87.12.57-.09 1.76-.72 2.01-1.42.25-.7.25-1.29.17-1.42-.08-.13-.27-.2-.57-.35z"
  }));
}

// Botanical olive branch, lifted from Session 1, slightly simplified for placeholder use
function OliveBranchPlaceholder({
  size = 88,
  color = "#2e6853",
  opacity = 0.4
}) {
  return /*#__PURE__*/React.createElement("svg", {
    width: size,
    height: size * 0.82,
    viewBox: "0 0 88 72",
    fill: "none",
    stroke: color,
    strokeOpacity: opacity,
    strokeWidth: "1.6",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": "true"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M14 62 C 24 48, 36 36, 52 24 C 60 18, 68 12, 76 8"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M28 50 C 22 47, 17 48, 14 52 C 18 56, 24 57, 30 54"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M42 36 C 48 30, 56 28, 60 31 C 58 37, 52 41, 44 40"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M60 22 C 65 18, 70 18, 72 22 C 70 27, 65 28, 62 26"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "34",
    cy: "46",
    r: "2.2",
    fill: color,
    fillOpacity: opacity,
    stroke: "none"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "50",
    cy: "32",
    r: "2",
    fill: color,
    fillOpacity: opacity,
    stroke: "none"
  }));
}
Object.assign(window, {
  IconHeart,
  IconCheck,
  IconWhatsApp,
  OliveBranchPlaceholder
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "parts/Icons2.jsx", error: String((e && e.message) || e) }); }

// parts/Logo.jsx
try { (() => {
// ============================================================
// Logo system — מהמקור in Frank Ruhl Libre 900 + olive branch.
//
// Four variants: horizontal, stacked, monogram (מ with leaf),
// and inverse for #2E4A2E footer. No English, no gradients,
// no bag. Olive sits to the END-side of text (left, in RTL).
// ============================================================

const WORDMARK_STYLE = {
  fontFamily: "var(--font-headline)",
  fontWeight: 900,
  letterSpacing: "-0.02em",
  lineHeight: 1,
  color: "var(--primary)",
  display: "inline-block",
  direction: "rtl"
};

// ---------- Horizontal lockup ----------
// In RTL, the wordmark "מהמקור" sits visually on the right; the
// botanical mark sits to its LEFT (the end-side). We achieve that
// by putting the mark FIRST in DOM order and letting `direction:rtl`
// + `inline-flex` lay them out: mark (left) ← wordmark (right).
function LogoHorizontal({
  height = 44,
  color = "var(--primary)",
  markKind = "olive"
}) {
  const fontSize = height * 0.9;
  const markSize = height * 0.78;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: height * 0.22,
      color,
      lineHeight: 1,
      direction: "rtl"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      ...WORDMARK_STYLE,
      color,
      fontSize
    }
  }, "\u05DE\u05D4\u05DE\u05E7\u05D5\u05E8"), /*#__PURE__*/React.createElement("span", {
    style: {
      color,
      display: "inline-flex",
      alignItems: "center"
    }
  }, /*#__PURE__*/React.createElement(ActiveMark, {
    kind: markKind,
    size: markSize,
    strokeWidth: 1.2
  })));
}

// ---------- Stacked lockup (splash / loading) ----------
function LogoStacked({
  size = 72,
  color = "var(--primary)",
  markKind = "olive"
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "inline-flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 10,
      color
    }
  }, /*#__PURE__*/React.createElement(ActiveMark, {
    kind: markKind,
    size: size * 0.7,
    strokeWidth: 1.2
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      ...WORDMARK_STYLE,
      color,
      fontSize: size
    }
  }, "\u05DE\u05D4\u05DE\u05E7\u05D5\u05E8"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 10,
      marginTop: 4
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 24,
      height: 1,
      background: "var(--accent)"
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-english)",
      fontStyle: "italic",
      fontWeight: 600,
      color: "var(--accent)",
      fontSize: size * 0.2,
      letterSpacing: "0.08em"
    }
  }, "from the source"), /*#__PURE__*/React.createElement("span", {
    style: {
      width: 24,
      height: 1,
      background: "var(--accent)"
    }
  })));
}

// ---------- Monogram ----------
// Just the מ in Frank Ruhl 900, wrapped in a soft square. Olive
// leaf tucked into the top-end corner as the decorative kerf.
// Readable at 16px because it's a single glyph.
function LogoMonogram({
  size = 48,
  color = "var(--primary)",
  bg = "transparent",
  border = true,
  markKind = "olive"
}) {
  const glyphSize = size * 0.74;
  const leafSize = size * 0.32;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      width: size,
      height: size,
      background: bg,
      border: border ? `1px solid ${color}` : "none",
      borderRadius: size * 0.2,
      position: "relative",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      color,
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-headline)",
      fontWeight: 900,
      fontSize: glyphSize,
      lineHeight: 1,
      color,
      transform: "translateY(2%)"
    }
  }, "\u05DE"), size >= 22 && /*#__PURE__*/React.createElement("span", {
    style: {
      position: "absolute",
      top: size * 0.06,
      insetInlineStart: size * 0.06,
      color,
      lineHeight: 0
    }
  }, /*#__PURE__*/React.createElement(ActiveMark, {
    kind: markKind,
    size: leafSize,
    strokeWidth: 1.2
  })));
}

// ---------- Inverse (footer, dark green) ----------
function LogoInverse({
  height = 44,
  markKind = "olive"
}) {
  return /*#__PURE__*/React.createElement(LogoHorizontal, {
    height: height,
    color: "var(--bg)",
    markKind: markKind
  });
}
Object.assign(window, {
  LogoHorizontal,
  LogoStacked,
  LogoMonogram,
  LogoInverse
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "parts/Logo.jsx", error: String((e && e.message) || e) }); }

// parts/OliveBranch.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
// ============================================================
// Botanical companion marks — three hand-drawn variations.
// Each is designed to read at 16px; stroke 1.2px max; color is
// inherited via currentColor (production call site sets #2e6853).
//
// A) WheatStalk — woodcut feel, single stalk, 3 grains
// B) OliveBranch — engraved feel, one branch, 3 olives, 1 leaf
// C) LeafSprig — loose imperfect lines, 2–3 leaves on thin stem
// ============================================================

// ------------------------------------------------------------
// A) WheatStalk — woodcut
// Grain heads drawn as paired teardrop halves with a fine midline,
// stalk angles slightly to suggest hand-cut. 3 grains stacked.
// ------------------------------------------------------------
function WheatStalk({
  size = 48,
  strokeWidth = 1.2,
  style,
  className
}) {
  return /*#__PURE__*/React.createElement("svg", {
    width: size,
    height: size,
    viewBox: "0 0 48 48",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: strokeWidth,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    style: style,
    className: className,
    "aria-hidden": "true"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M 26 44 C 24.5 36, 23.5 28, 22.5 18 C 22.2 14, 22 10, 22 6"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M 22 6 C 19.2 8, 18 11, 19 14 C 20 12, 21 10, 22 9"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M 22 6 C 24.8 8, 26 11, 25 14 C 24 12, 23 10, 22 9"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M 22 8.5 L 22 14"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M 22 6 L 22 2.5"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M 22.4 16 C 18 17, 15.5 20, 16 24 C 18 22.5, 20 21, 22 20"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M 22.4 16 C 20.5 18, 19 20.5, 18.5 23"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M 22.6 18 C 27 19, 29.5 22, 29 26 C 27 24.5, 25 23, 23 22"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M 22.6 18 C 24.5 20, 26 22.5, 26.5 25"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M 23 28 C 18.5 29.5, 16 32.5, 17 36 C 19 34, 21 32.5, 23 31.5"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M 23 28 C 21 30, 19.5 32, 19 34.5"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M 23.2 30 C 27.5 31.5, 30 34.5, 29 38 C 27 36, 25 34.5, 23.2 33.5"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M 23.2 30 C 25 32, 26.5 34, 27 36.5"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M 26 42 C 29 41, 32 39, 33 36"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M 24 43 C 21 42.5, 18 41, 16.5 39"
  }));
}

// ------------------------------------------------------------
// B) OliveBranch — hand-engraved
// Single branch curving up-and-end; 3 small olive fruits hanging
// at staggered points; one pointed leaf mid-branch.
// ------------------------------------------------------------
function OliveBranchMark({
  size = 48,
  strokeWidth = 1.2,
  style,
  className
}) {
  return /*#__PURE__*/React.createElement("svg", {
    width: size,
    height: size,
    viewBox: "0 0 48 48",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: strokeWidth,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    style: style,
    className: className,
    "aria-hidden": "true"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M 7 40 C 14 34, 19 29, 25 22 C 30 16, 35 11, 41 8"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M 22 25 C 17 22, 13 21, 10 22.5 C 12 26, 17 28, 22 26.5 Z"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M 12 23.5 C 15 25, 18 26, 22 26"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M 17 32 L 14.5 35"
  }), /*#__PURE__*/React.createElement("ellipse", {
    cx: "13.5",
    cy: "36.5",
    rx: "2.1",
    ry: "2.7",
    transform: "rotate(-20 13.5 36.5)"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M 26 20 L 28 17"
  }), /*#__PURE__*/React.createElement("ellipse", {
    cx: "28.8",
    cy: "15.5",
    rx: "2",
    ry: "2.6",
    transform: "rotate(18 28.8 15.5)"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M 34 12 L 33 8.5"
  }), /*#__PURE__*/React.createElement("ellipse", {
    cx: "32.6",
    cy: "7.2",
    rx: "1.9",
    ry: "2.5",
    transform: "rotate(-12 32.6 7.2)"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M 40.5 8 L 42.5 6.5"
  }));
}

// ------------------------------------------------------------
// C) LeafSprig — loose, imperfect
// 2–3 leaves on a thin stem; lines deliberately irregular.
// ------------------------------------------------------------
function LeafSprig({
  size = 48,
  strokeWidth = 1.2,
  style,
  className
}) {
  return /*#__PURE__*/React.createElement("svg", {
    width: size,
    height: size,
    viewBox: "0 0 48 48",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: strokeWidth,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    style: style,
    className: className,
    "aria-hidden": "true"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M 10 42 C 14 34, 19 28, 23 22 C 27 16, 31 11, 38 7"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M 16 32 C 11 30, 7 31, 6 34 C 9 37, 14 37, 17.5 35"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M 8 33 C 11 34.5, 14 35, 16.5 34.5"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M 24 22 C 28 18, 33 17, 35.5 19.5 C 33 23.5, 28 25, 23.5 23.5"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M 34 20 C 31 21, 27.5 22, 24 22.8"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M 33 11 C 35.5 8, 38 7.5, 39.5 9 C 38 12, 35 13, 33 12"
  }));
}

// ------------------------------------------------------------
// Active-mark switcher — Logo.jsx reads window.ActiveMark(key).
// Keys: "wheat" | "olive" | "leaf"
// ------------------------------------------------------------
function ActiveMark({
  kind = "olive",
  size = 48,
  strokeWidth = 1.2,
  style,
  className
}) {
  const props = {
    size,
    strokeWidth,
    style,
    className
  };
  if (kind === "wheat") return /*#__PURE__*/React.createElement(WheatStalk, props);
  if (kind === "leaf") return /*#__PURE__*/React.createElement(LeafSprig, props);
  return /*#__PURE__*/React.createElement(OliveBranchMark, props);
}

// Back-compat alias — old components import OliveBranch.
function OliveBranch(props) {
  return /*#__PURE__*/React.createElement(ActiveMark, _extends({
    kind: "olive"
  }, props));
}
Object.assign(window, {
  WheatStalk,
  OliveBranchMark,
  LeafSprig,
  ActiveMark,
  OliveBranch
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "parts/OliveBranch.jsx", error: String((e && e.message) || e) }); }

// parts/ProducerCard2.jsx
try { (() => {
// ============================================================
// ProducerCard — Session 2
// Hand-cut catalog entry. NOT an app tile.
// ============================================================

function AvailabilityDot({
  state
}) {
  if (!state) return null;
  const color = state === 'available' ? '#4cb08b' : '#E8823A';
  const label = state === 'available' ? 'אופה השבוע' : 'בחופשה';
  return /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      fontFamily: 'var(--font-body)',
      fontSize: 12,
      fontWeight: 500,
      color: state === 'available' ? '#2E4A2E' : '#8B4A1A'
    }
  }, /*#__PURE__*/React.createElement("span", {
    "aria-hidden": "true",
    style: {
      display: 'inline-block',
      width: 8,
      height: 8,
      borderRadius: '50%',
      background: color,
      boxShadow: `0 0 0 3px ${color}22`
    }
  }), label);
}
function Badge({
  kind
}) {
  if (kind === 'verified') {
    return /*#__PURE__*/React.createElement("span", {
      style: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        background: '#EAF3DE',
        color: '#2E4A2E',
        border: '0.5px solid #2e6853',
        padding: '4px 10px',
        borderRadius: 4,
        fontSize: 11,
        fontWeight: 500,
        letterSpacing: '0.02em'
      }
    }, /*#__PURE__*/React.createElement(IconCheck, {
      size: 11
    }), " \u05DE\u05D0\u05D5\u05DE\u05EA");
  }
  if (kind === 'new') {
    return /*#__PURE__*/React.createElement("span", {
      style: {
        display: 'inline-flex',
        alignItems: 'center',
        background: '#F5F0E8',
        color: '#8B6914',
        border: '0.5px solid #8B6914',
        padding: '4px 10px',
        borderRadius: 4,
        fontSize: 11,
        fontWeight: 500,
        letterSpacing: '0.02em'
      }
    }, "\u05D7\u05D3\u05E9");
  }
  return null;
}
function ProducerCard({
  p = {},
  forcedState,
  size = 'default',
  onClick
}) {
  const [hoverState, setHoverState] = React.useState(false);
  const [savedState, setSavedState] = React.useState(p.saved || false);
  const hover = forcedState === 'hover' || hoverState;
  const selected = forcedState === 'selected';
  const loading = forcedState === 'loading';
  if (loading) {
    return /*#__PURE__*/React.createElement(ProducerCardSkeleton, {
      size: size
    });
  }
  const isMobile = size === 'mobile';
  return /*#__PURE__*/React.createElement("article", {
    onMouseEnter: () => setHoverState(true),
    onMouseLeave: () => setHoverState(false),
    onClick: onClick,
    style: {
      background: '#F5F0E8',
      border: selected ? '1.5px solid #2e6853' : '0.5px solid #e8e0d0',
      borderRadius: 16,
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      cursor: 'pointer',
      transition: 'transform .25s var(--ease-out), box-shadow .25s var(--ease-out), border-color .2s var(--ease-out)',
      transform: hover ? 'translateY(-2px)' : 'none',
      boxShadow: hover ? '0 8px 32px rgba(46,104,83,0.12)' : 'none',
      position: 'relative',
      width: '100%'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      aspectRatio: '4 / 3',
      overflow: 'hidden',
      background: '#EAF3DE'
    }
  }, p.img ? /*#__PURE__*/React.createElement("img", {
    src: p.img,
    alt: "",
    style: {
      width: '100%',
      height: '100%',
      objectFit: 'cover',
      display: 'block',
      transition: 'transform .4s var(--ease-out)',
      transform: hover ? 'scale(1.03)' : 'none'
    }
  }) : /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      background: '#EAF3DE'
    }
  }, /*#__PURE__*/React.createElement(OliveBranchPlaceholder, {
    size: isMobile ? 72 : 88,
    color: "#2e6853",
    opacity: 0.35
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-headline)',
      fontWeight: 700,
      fontSize: isMobile ? 22 : 26,
      color: '#2e6853',
      letterSpacing: '0.04em',
      marginTop: 2
    }
  }, p.initials || '·')), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      background: '#8B6914',
      mixBlendMode: 'multiply',
      opacity: hover ? 0.08 : 0,
      transition: 'opacity .25s var(--ease-out)',
      pointerEvents: 'none'
    }
  }), /*#__PURE__*/React.createElement("button", {
    onClick: e => {
      e.stopPropagation();
      setSavedState(!savedState);
    },
    "aria-label": savedState ? 'הסירי ממועדפים' : 'שמרי במועדפים',
    style: {
      position: 'absolute',
      top: 12,
      insetInlineStart: 12,
      width: 40,
      height: 40,
      borderRadius: 9999,
      background: 'rgba(245,240,232,0.95)',
      border: 'none',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: savedState ? '#A32D2D' : '#5c584f',
      zIndex: 2,
      transition: 'color .2s ease, transform .2s ease',
      transform: hover ? 'scale(1.05)' : 'none'
    }
  }, /*#__PURE__*/React.createElement(IconHeart, {
    size: 20,
    filled: savedState
  })), p.availability && /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      bottom: 12,
      insetInlineEnd: 12,
      background: 'rgba(245,240,232,0.95)',
      padding: '5px 10px',
      borderRadius: 9999,
      backdropFilter: 'blur(4px)'
    }
  }, /*#__PURE__*/React.createElement(AvailabilityDot, {
    state: p.availability
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: isMobile ? 14 : 16,
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("h3", {
    style: {
      fontFamily: 'var(--font-headline)',
      fontWeight: 700,
      fontSize: isMobile ? 18 : 20,
      lineHeight: 1.25,
      color: '#1C1A17',
      margin: 0
    }
  }, p.name), /*#__PURE__*/React.createElement("p", {
    style: {
      fontFamily: 'var(--font-body)',
      fontSize: 13,
      color: '#5c584f',
      margin: 0
    }
  }, p.city, p.distance && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("span", {
    style: {
      opacity: 0.5,
      margin: '0 6px'
    }
  }, "\xB7"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-english)',
      fontStyle: 'italic',
      fontWeight: 500
    }
  }, p.distance))), p.description && /*#__PURE__*/React.createElement("p", {
    style: {
      fontFamily: 'var(--font-body)',
      fontSize: 13,
      color: 'rgba(28,26,23,0.85)',
      lineHeight: 1.5,
      margin: '2px 0 0',
      overflow: 'hidden',
      display: '-webkit-box',
      WebkitLineClamp: 2,
      WebkitBoxOrient: 'vertical'
    }
  }, p.description), (p.verified || p.isNew) && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 6,
      marginTop: 10,
      flexWrap: 'wrap'
    }
  }, p.verified && /*#__PURE__*/React.createElement(Badge, {
    kind: "verified"
  }), p.isNew && /*#__PURE__*/React.createElement(Badge, {
    kind: "new"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 'auto',
      paddingTop: 12,
      borderTop: '0.5px solid #e8e0d0',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-english)',
      fontStyle: 'italic',
      fontWeight: 500,
      fontSize: 15,
      color: '#8B6914',
      letterSpacing: '0.01em'
    }
  }, p.price || ''), p.whatsapp && /*#__PURE__*/React.createElement("button", {
    onClick: e => e.stopPropagation(),
    "aria-label": "\u05E6\u05E8\u05D9 \u05E7\u05E9\u05E8 \u05D1\u05D5\u05D5\u05D0\u05D8\u05E1\u05D0\u05E4",
    style: {
      background: 'transparent',
      border: 'none',
      padding: 0,
      cursor: 'pointer',
      display: 'inline-flex',
      alignItems: 'center',
      opacity: hover ? 1 : 0.85,
      transition: 'opacity .2s ease'
    }
  }, /*#__PURE__*/React.createElement(IconWhatsApp, {
    size: 20
  })))));
}
function ProducerCardSkeleton({
  size = 'default'
}) {
  const isMobile = size === 'mobile';
  const shimmer = {
    background: 'linear-gradient(90deg, #E8E0D0 0%, #EFE8DC 50%, #E8E0D0 100%)',
    backgroundSize: '200% 100%',
    animation: 'mk-shimmer 1.6s linear infinite'
  };
  return /*#__PURE__*/React.createElement("article", {
    style: {
      background: '#F5F0E8',
      border: '0.5px solid #e8e0d0',
      borderRadius: 16,
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column'
    }
  }, /*#__PURE__*/React.createElement("style", null, `@keyframes mk-shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`), /*#__PURE__*/React.createElement("div", {
    style: {
      aspectRatio: '4 / 3',
      ...shimmer
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: isMobile ? 14 : 16,
      display: 'flex',
      flexDirection: 'column',
      gap: 10
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      height: 20,
      width: '70%',
      borderRadius: 4,
      ...shimmer
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      height: 12,
      width: '45%',
      borderRadius: 4,
      ...shimmer
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      height: 12,
      width: '90%',
      borderRadius: 4,
      ...shimmer,
      marginTop: 4
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      marginTop: 14,
      paddingTop: 12,
      borderTop: '0.5px solid #e8e0d0'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      height: 14,
      width: 80,
      borderRadius: 4,
      ...shimmer
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      height: 18,
      width: 18,
      borderRadius: 9999,
      ...shimmer
    }
  }))));
}
Object.assign(window, {
  ProducerCard,
  ProducerCardSkeleton
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "parts/ProducerCard2.jsx", error: String((e && e.message) || e) }); }

// pins.jsx
try { (() => {
/* Category pins — SVG line-art, Foursquare-style circle pins with price pill variant */

const CATEGORY_META = {
  בשר: {
    color: '#c04040',
    key: 'meat'
  },
  ירקות: {
    color: '#2e6853',
    key: 'veg'
  },
  חלב: {
    color: '#4a90d9',
    key: 'dairy'
  },
  לחמים: {
    color: '#8B6914',
    key: 'bread'
  },
  שמנים: {
    color: '#e8a020',
    key: 'oil'
  },
  טיפוח: {
    color: '#9b59b6',
    key: 'care'
  }
};

/* Line-art glyphs, 24 viewBox, stroke 1.8, stroke currentColor */
const GLYPHS = {
  meat: /*#__PURE__*/React.createElement("g", {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.8",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M5 15c0-3 2-6 6-6s8 2 8 6-3 6-7 6-7-2-7-6z"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M16 10l4-4"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "20.5",
    cy: "5.5",
    r: "1.4"
  })),
  veg: /*#__PURE__*/React.createElement("g", {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.8",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M12 20V8"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M12 8c0 0-5-1.5-7 3 1.5.3 4.5 0 7 2"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M12 11c0 0 4.5-3 8 1-1.5.8-4.5.3-8 2"
  })),
  dairy: /*#__PURE__*/React.createElement("g", {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.8",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M9 6h6v2"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M8 8h8v11a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2V8z"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M8 12h8"
  })),
  bread: /*#__PURE__*/React.createElement("g", {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.8",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M5 13c0-3 3-5 7-5s7 2 7 5"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M5 13v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3z"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M9 8c0-1.5-.5-2.5 0-4"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M12 8c0-2-.5-3 0-4.5"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M15 8c0-1.5-.5-2.5 0-4"
  })),
  oil: /*#__PURE__*/React.createElement("g", {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.8",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M9 9v10a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2V9z"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M8 9h8"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M9.5 6h5a1.5 1.5 0 0 1 1.5 1.5V9H8V7.5A1.5 1.5 0 0 1 9.5 6z"
  }), /*#__PURE__*/React.createElement("ellipse", {
    cx: "12",
    cy: "15",
    rx: "1.8",
    ry: "2.4"
  })),
  care: /*#__PURE__*/React.createElement("g", {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.8",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M12 20V10"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M12 10c0 0-4-1-5 2 1 .2 3 0 5 1.5"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M12 12c0 0 3.5-2 5.5 1-1 .5-3 .2-5.5 1.5"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "12",
    cy: "6",
    r: "1.5"
  }))
};

/* Circle pin — 36px default / 44px selected */
function CategoryPin({
  category,
  selected,
  onClick,
  onMouseEnter,
  onMouseLeave
}) {
  const meta = CATEGORY_META[category] || CATEGORY_META['ירקות'];
  const size = selected ? 44 : 36;
  return /*#__PURE__*/React.createElement("button", {
    onClick: onClick,
    onMouseEnter: onMouseEnter,
    onMouseLeave: onMouseLeave,
    "aria-label": category,
    style: {
      width: size,
      height: size,
      borderRadius: '50%',
      background: meta.color,
      border: '2px solid #fff',
      boxShadow: selected ? '0 4px 14px rgba(0,0,0,0.28), 0 0 0 4px rgba(46,104,83,0.18)' : '0 2px 8px rgba(0,0,0,0.2)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#fff',
      cursor: 'pointer',
      padding: 0,
      transition: 'transform 200ms var(--ease-out), box-shadow 200ms var(--ease-out)',
      transform: selected ? 'scale(1)' : 'scale(1)'
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: size * 0.6,
    height: size * 0.6,
    viewBox: "0 0 24 24"
  }, GLYPHS[meta.key]));
}

/* Price pill — shown on hover (Airbnb-style) */
function PricePin({
  category,
  price,
  selected,
  onClick,
  onMouseEnter,
  onMouseLeave
}) {
  const meta = CATEGORY_META[category] || CATEGORY_META['ירקות'];
  return /*#__PURE__*/React.createElement("button", {
    onClick: onClick,
    onMouseEnter: onMouseEnter,
    onMouseLeave: onMouseLeave,
    style: {
      background: selected ? '#1C1A17' : '#fff',
      color: selected ? '#fff' : '#1C1A17',
      border: `2px solid ${selected ? '#fff' : meta.color}`,
      borderRadius: 9999,
      padding: '6px 12px',
      fontFamily: 'var(--font-body)',
      fontWeight: 600,
      fontSize: 13,
      boxShadow: selected ? '0 4px 14px rgba(0,0,0,0.32), 0 0 0 3px rgba(255,255,255,0.9)' : '0 2px 8px rgba(0,0,0,0.2)',
      cursor: 'pointer',
      whiteSpace: 'nowrap',
      transition: 'all 200ms var(--ease-out)'
    }
  }, price);
}

/* Cluster pin — cream bg, primary border, count in Frank Ruhl */
function ClusterPin({
  count,
  onClick
}) {
  const size = count > 20 ? 56 : count > 9 ? 48 : 42;
  return /*#__PURE__*/React.createElement("button", {
    onClick: onClick,
    "aria-label": `${count} בתי עסק`,
    style: {
      width: size,
      height: size,
      borderRadius: '50%',
      background: '#F5F0E8',
      border: '2px solid #2e6853',
      color: '#2e6853',
      fontFamily: 'var(--font-headline)',
      fontWeight: 700,
      fontSize: size > 50 ? 20 : size > 44 ? 18 : 16,
      boxShadow: '0 2px 10px rgba(0,0,0,0.18)',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 0
    }
  }, count);
}
Object.assign(window, {
  CATEGORY_META,
  CategoryPin,
  PricePin,
  ClusterPin
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "pins.jsx", error: String((e && e.message) || e) }); }

// source/BottomNav.jsx
try { (() => {
"use client";

/**
 * Mobile bottom nav — 5 tabs. Went from 4 to 5 when /neighbor got its
 * own page (previously the home-kitchen section lived on the homepage).
 * grid-cols-5 makes each tab ~20% wide; icons and labels stay legible.
 */
function BottomNav() {
  const pathname = usePathname();
  const {
    t
  } = useLanguage();
  const tabs = [{
    href: "/",
    Icon: House,
    labelKey: "nav_discover",
    match: p => p === "/"
  }, {
    href: "/map",
    Icon: MapTrifold,
    labelKey: "nav_map",
    match: p => p === "/map"
  }, {
    href: "/events",
    Icon: CalendarBlank,
    labelKey: "nav_events",
    match: p => p.startsWith("/events")
  }, {
    href: "/neighbor",
    Icon: CookingPot,
    labelKey: "nav_neighbor",
    match: p => p.startsWith("/neighbor")
  }, {
    href: "/favorites",
    Icon: Heart,
    labelKey: "nav_favorites",
    match: p => p === "/favorites"
  }];
  return /*#__PURE__*/React.createElement("nav", {
    className: "md:hidden fixed bottom-0 inset-x-0 z-[1000] bg-white border-t border-border shadow-[0_-2px_8px_rgba(0,0,0,0.04)]",
    "aria-label": t("nav_mobile_label")
  }, /*#__PURE__*/React.createElement("ul", {
    className: "grid grid-cols-5"
  }, tabs.map(tab => {
    const active = tab.match(pathname || "/");
    const Icon = tab.Icon;
    return /*#__PURE__*/React.createElement("li", {
      key: tab.labelKey
    }, /*#__PURE__*/React.createElement(Link, {
      href: tab.href,
      className: `flex flex-col items-center justify-center py-2 min-h-[44px] text-[11px] transition ${active ? "text-primary" : "text-site-muted"}`,
      "aria-current": active ? "page" : undefined
    }, /*#__PURE__*/React.createElement(Icon, {
      size: 22,
      weight: active ? "fill" : "duotone"
    }), /*#__PURE__*/React.createElement("span", {
      className: "mt-1"
    }, t(tab.labelKey))));
  })));
}
Object.assign(__ds_scope, { BottomNav });
})(); } catch (e) { __ds_ns.__errors.push({ path: "source/BottomNav.jsx", error: String((e && e.message) || e) }); }

// source/Footer.jsx
try { (() => {
"use client";

const {
  useState
} = React;
/**
 * Four-column sitemap footer + brand column + newsletter block.
 * Structure (per docs/archive/UX_FIXES.md Fix 4 + docs/archive/COPY_FIXES.md Fix 4):
 *   - לגלות:          דף הבית | מפה | אירועים | עסקים חדשים
 *   - קהילה:          אירועים | מהמטבח של השכן | אודות
 *   - בתי עסק:       הוסף עסק | כניסה | ניהול העסק
 *   - שקיפות ואמון:   תנאי שימוש | פרטיות | נגישות | יצירת קשר
 *                     (Israeli legal compliance — all four pages required)
 */
function Footer() {
  const {
    t
  } = useLanguage();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState(null); // null | 'loading' | 'success' | 'error'
  const [message, setMessage] = useState("");
  const handleSubscribe = async e => {
    e.preventDefault();
    if (!email) return;
    setStatus("loading");
    setMessage("");
    try {
      await api.post("/newsletter", {
        email
      });
      setStatus("success");
      setMessage("ברוכה הבאה למהמקור 🌱 נפגשות בתיבה");
      setEmail("");
    } catch (err) {
      setStatus("error");
      setMessage(err.response?.data?.detail || "משהו השתבש, נסי שוב");
    }
  };
  const columns = [{
    title: t("footer_discover"),
    links: [{
      href: "/",
      label: t("footer_home")
    }, {
      href: "/map",
      label: t("footer_map")
    }, {
      href: "/#producers-grid",
      label: t("footer_all_businesses")
    }, {
      href: "/#producers-grid",
      label: t("footer_new_businesses")
    }]
  }, {
    title: t("footer_community"),
    links: [{
      href: "/events",
      label: t("footer_events")
    }, {
      href: "/#home-kitchen",
      label: t("footer_neighbor_kitchen")
    }, {
      href: "/about",
      label: t("footer_about")
    }]
  }, {
    title: t("footer_businesses"),
    links: [{
      href: "/register/producer",
      label: t("footer_add_business")
    }, {
      href: "/login",
      label: t("footer_login")
    }, {
      href: "/producer/dashboard",
      label: t("footer_manage")
    }]
  }, {
    title: t("footer_trust"),
    links: [{
      href: "/terms",
      label: t("footer_terms")
    }, {
      href: "/privacy",
      label: t("footer_privacy")
    }, {
      href: "/accessibility",
      label: t("footer_accessibility")
    }, {
      href: "/contact",
      label: t("footer_contact")
    }]
  }];
  return /*#__PURE__*/React.createElement("footer", {
    className: "bg-primary-dark text-light mt-16"
  }, /*#__PURE__*/React.createElement("div", {
    className: "max-w-7xl mx-auto px-4 py-12"
  }, /*#__PURE__*/React.createElement("div", {
    className: "grid grid-cols-1 md:grid-cols-12 gap-8 mb-10"
  }, /*#__PURE__*/React.createElement("div", {
    className: "md:col-span-3"
  }, /*#__PURE__*/React.createElement(Link, {
    href: "/"
  }, /*#__PURE__*/React.createElement(Image, {
    src: "/logo-footer.png",
    alt: "\u05DE\u05D4\u05DE\u05E7\u05D5\u05E8",
    width: 140,
    height: 52,
    className: "mb-4 brightness-0 invert"
  })), /*#__PURE__*/React.createElement("p", {
    className: "text-light/90 text-sm leading-relaxed max-w-xs mb-3"
  }, "\u05D9\u05E9\u05E8 \u05DE\u05D4\u05DE\u05E7\u05D5\u05E8 \u05D0\u05DC\u05D9\u05DA. \u05E4\u05DC\u05D8\u05E4\u05D5\u05E8\u05DE\u05D4 \u05E9\u05DE\u05D7\u05D1\u05E8\u05EA \u05D1\u05D9\u05DF \u05D1\u05EA\u05D9 \u05E2\u05E1\u05E7 \u05DE\u05E7\u05D5\u05DE\u05D9\u05D9\u05DD, \u05DE\u05D2\u05D3\u05DC\u05D9\u05DD \u05E7\u05D8\u05E0\u05D9\u05DD \u05D5\u05E9\u05DB\u05E0\u05D5\u05EA \u05E9\u05DE\u05D1\u05E9\u05DC\u05D5\u05EA \u05D1\u05D1\u05D9\u05EA \u2014 \u05DC\u05E6\u05E8\u05DB\u05E0\u05D9\u05DD \u05D9\u05E9\u05E8\u05D0\u05DC\u05D9\u05D9\u05DD."), /*#__PURE__*/React.createElement("ul", {
    className: "text-light/70 text-xs space-y-1 mb-4"
  }, /*#__PURE__*/React.createElement("li", null, "\u05D7.\u05E4.: \u05E8\u05E9\u05D5\u05DD \u05DC\u05E4\u05E0\u05D9 \u05D4\u05E9\u05E7\u05D4"), /*#__PURE__*/React.createElement("li", null, "\u05DB\u05EA\u05D5\u05D1\u05EA: \u05E8\u05E9\u05D5\u05DD \u05DC\u05E4\u05E0\u05D9 \u05D4\u05E9\u05E7\u05D4"), /*#__PURE__*/React.createElement("li", null, "\uD83D\uDCE7 levismadar80@gmail.com")), /*#__PURE__*/React.createElement("a", {
    href: "https://www.instagram.com/meha_makor",
    target: "_blank",
    rel: "noopener noreferrer",
    "aria-label": "\u05E2\u05DE\u05D5\u05D3 \u05D4\u05D0\u05D9\u05E0\u05E1\u05D8\u05D2\u05E8\u05DD \u05E9\u05DC \u05DE\u05D4\u05DE\u05E7\u05D5\u05E8 \u2014 \u05E0\u05E4\u05EA\u05D7 \u05D1\u05D7\u05DC\u05D5\u05DF \u05D7\u05D3\u05E9",
    className: "inline-flex items-center gap-2 text-light/90 hover:text-white transition"
  }, /*#__PURE__*/React.createElement(InstagramLogo, {
    size: 20,
    weight: "duotone",
    "aria-hidden": "true"
  }), /*#__PURE__*/React.createElement("span", {
    className: "font-body"
  }, "@meha_makor"))), /*#__PURE__*/React.createElement("nav", {
    className: "md:col-span-6 grid grid-cols-2 sm:grid-cols-4 gap-6",
    "aria-label": "\u05E0\u05D9\u05D5\u05D5\u05D8 \u05E8\u05D0\u05E9\u05D9 \u05D1\u05E4\u05D5\u05D8\u05E8"
  }, columns.map(col => /*#__PURE__*/React.createElement("div", {
    key: col.title
  }, /*#__PURE__*/React.createElement("h3", {
    className: "font-headline text-base font-bold mb-3 text-white"
  }, col.title), /*#__PURE__*/React.createElement("ul", {
    className: "flex flex-col gap-2 text-sm text-light/90"
  }, col.links.map(link => /*#__PURE__*/React.createElement("li", {
    key: `${col.title}-${link.label}`
  }, /*#__PURE__*/React.createElement(Link, {
    href: link.href,
    className: "hover:text-white transition"
  }, link.label))))))), /*#__PURE__*/React.createElement("div", {
    className: "md:col-span-3"
  }, /*#__PURE__*/React.createElement("h3", {
    className: "font-headline text-2xl font-bold mb-2 text-white"
  }, t("footer_newsletter_title")), /*#__PURE__*/React.createElement("p", {
    className: "text-light/90 text-sm mb-4"
  }, t("footer_newsletter_subtitle")), /*#__PURE__*/React.createElement("form", {
    onSubmit: handleSubscribe,
    className: "flex flex-col gap-2"
  }, /*#__PURE__*/React.createElement("label", {
    htmlFor: "footer-newsletter-email",
    className: "sr-only"
  }, "\u05D0\u05D9\u05DE\u05D9\u05D9\u05DC \u05DC\u05E0\u05D9\u05D5\u05D6\u05DC\u05D8\u05E8"), /*#__PURE__*/React.createElement("input", {
    id: "footer-newsletter-email",
    type: "email",
    required: true,
    dir: "ltr",
    value: email,
    onChange: e => setEmail(e.target.value),
    placeholder: t("footer_newsletter_placeholder"),
    className: "bg-transparent border text-white placeholder:text-light/60 rounded-[8px] px-4 py-2 outline-none focus:border-white focus-visible:ring-2 focus-visible:ring-light",
    style: {
      borderColor: "rgba(255,255,255,0.3)"
    }
  }), /*#__PURE__*/React.createElement("button", {
    type: "submit",
    disabled: status === "loading",
    className: "bg-light text-primary-dark px-5 py-2 rounded-[8px] hover:bg-white transition font-medium disabled:opacity-60"
  }, status === "loading" ? /*#__PURE__*/React.createElement("span", {
    className: "inline-flex items-center gap-2"
  }, /*#__PURE__*/React.createElement(ButtonSpinner, null), t("footer_newsletter_loading")) : t("footer_newsletter_submit"))), message && /*#__PURE__*/React.createElement("p", {
    role: "status",
    "aria-live": "polite",
    className: `text-sm mt-3 ${status === "success" ? "text-light" : "text-red-200"}`
  }, message))), /*#__PURE__*/React.createElement("div", {
    className: "border-t border-white/10 pt-6 flex flex-col md:flex-row items-center justify-between gap-3 text-xs text-light/70"
  }, /*#__PURE__*/React.createElement("p", null, "\xA9 ", new Date().getFullYear(), " ", t("footer_copyright")), /*#__PURE__*/React.createElement("p", null, t("footer_made_with_love")))));
}
Object.assign(__ds_scope, { Footer });
})(); } catch (e) { __ds_ns.__errors.push({ path: "source/Footer.jsx", error: String((e && e.message) || e) }); }

// source/Header.jsx
try { (() => {
"use client";

const {
  useEffect,
  useState
} = React;
/**
 * Header (docs/archive/WORLD_CLASS_V2.md #2 — navbar scroll blur)
 *
 * Starts with a solid cream background at the top of the page and
 * transitions to a blurred translucent pane once the user scrolls
 * past 60px. Keeps the warm palette — does NOT switch to a dark
 * "authkit" style which would contradict the brand direction in
 * CLAUDE.md ("warm and organic, not startup").
 */
function Header() {
  const {
    user,
    logout
  } = useAuth();
  const {
    lang,
    setLang,
    t
  } = useLanguage();
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 60);
    onScroll();
    window.addEventListener("scroll", onScroll, {
      passive: true
    });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return /*#__PURE__*/React.createElement("header", {
    className: ["sticky top-0 z-50 transition-[background-color,backdrop-filter,border-color,box-shadow] duration-300 ease-out", scrolled ? "bg-background/85 backdrop-blur-md border-b border-border shadow-[0_2px_20px_rgba(46,104,83,0.06)]" : "bg-background border-b border-transparent"].join(" ")
  }, /*#__PURE__*/React.createElement("div", {
    className: "max-w-7xl mx-auto px-4 h-16 flex items-center justify-between"
  }, /*#__PURE__*/React.createElement(Link, {
    href: "/"
  }, /*#__PURE__*/React.createElement(Image, {
    src: "/logo.png",
    alt: "\u05DE\u05D4\u05DE\u05E7\u05D5\u05E8",
    width: 106,
    height: 40,
    priority: true
  })), /*#__PURE__*/React.createElement("nav", {
    className: "hidden md:flex items-center gap-6"
  }, /*#__PURE__*/React.createElement(Link, {
    href: "/",
    className: "text-site-muted hover:text-primary transition"
  }, t("nav_discover")), /*#__PURE__*/React.createElement(Link, {
    href: "/map",
    className: "text-site-muted hover:text-primary transition"
  }, t("nav_map")), /*#__PURE__*/React.createElement(Link, {
    href: "/events",
    className: "text-site-muted hover:text-primary transition"
  }, t("nav_events")), /*#__PURE__*/React.createElement(Link, {
    href: "/neighbor",
    className: "text-site-muted hover:text-primary transition inline-flex items-center gap-1"
  }, t("nav_neighbor"), /*#__PURE__*/React.createElement(House, {
    size: 16,
    weight: "duotone",
    "aria-hidden": "true"
  })), /*#__PURE__*/React.createElement(Link, {
    href: "/about",
    className: "text-site-muted hover:text-primary transition"
  }, t("nav_about")), /*#__PURE__*/React.createElement(Link, {
    href: "/register/producer",
    className: "bg-primary text-white px-4 py-2 rounded-full hover:bg-primary-light transition focus-visible:ring-2 focus-visible:ring-primary/40"
  }, t("nav_add_business")), /*#__PURE__*/React.createElement("button", {
    onClick: () => setLang(lang === "he" ? "en" : "he"),
    className: "text-sm text-site-muted hover:text-primary transition border border-border rounded-full px-3 py-1 flex items-center gap-1.5",
    "aria-label": lang === "he" ? "Switch to English" : "החלף לעברית"
  }, /*#__PURE__*/React.createElement("span", {
    className: lang === "he" ? "font-bold text-primary" : ""
  }, "\u05E2\u05D1"), /*#__PURE__*/React.createElement("span", {
    className: "text-border"
  }, "/"), /*#__PURE__*/React.createElement("span", {
    className: lang === "en" ? "font-bold text-primary" : ""
  }, "EN")), user ? /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-4"
  }, /*#__PURE__*/React.createElement(Link, {
    href: "/favorites",
    className: "text-site-muted hover:text-primary transition inline-flex items-center gap-1",
    "aria-label": t("nav_favorites")
  }, /*#__PURE__*/React.createElement(Heart, {
    size: 18,
    weight: "duotone"
  }), /*#__PURE__*/React.createElement("span", {
    className: "hidden lg:inline"
  }, t("nav_favorites"))), /*#__PURE__*/React.createElement(Link, {
    href: "/settings",
    className: "text-site-muted hover:text-primary transition text-sm"
  }, user.name), user.role === "admin" && /*#__PURE__*/React.createElement(Link, {
    href: "/admin",
    className: "text-secondary hover:underline text-sm"
  }, t("nav_admin")), /*#__PURE__*/React.createElement("button", {
    onClick: logout,
    className: "text-sm text-site-muted hover:text-red-500"
  }, t("nav_logout"))) : /*#__PURE__*/React.createElement(Link, {
    href: "/login",
    className: "text-site-muted hover:text-primary transition"
  }, t("nav_login"))), /*#__PURE__*/React.createElement("button", {
    className: "md:hidden p-2 text-site-text",
    onClick: () => setMenuOpen(!menuOpen),
    "aria-label": menuOpen ? "סגור תפריט" : "פתח תפריט",
    "aria-expanded": menuOpen
  }, menuOpen ? /*#__PURE__*/React.createElement(X, {
    size: 24,
    weight: "bold"
  }) : /*#__PURE__*/React.createElement(List, {
    size: 24,
    weight: "bold"
  }))), menuOpen && /*#__PURE__*/React.createElement("div", {
    className: "md:hidden bg-background border-t border-border px-4 py-3 space-y-3"
  }, /*#__PURE__*/React.createElement(Link, {
    href: "/",
    className: "block text-site-muted",
    onClick: () => setMenuOpen(false)
  }, t("nav_discover")), /*#__PURE__*/React.createElement(Link, {
    href: "/map",
    className: "block text-site-muted",
    onClick: () => setMenuOpen(false)
  }, t("nav_map")), /*#__PURE__*/React.createElement(Link, {
    href: "/events",
    className: "block text-site-muted",
    onClick: () => setMenuOpen(false)
  }, t("nav_events")), /*#__PURE__*/React.createElement(Link, {
    href: "/neighbor",
    className: "flex items-center gap-1 text-site-muted",
    onClick: () => setMenuOpen(false)
  }, t("nav_neighbor"), /*#__PURE__*/React.createElement(House, {
    size: 16,
    weight: "duotone",
    "aria-hidden": "true"
  })), /*#__PURE__*/React.createElement(Link, {
    href: "/about",
    className: "block text-site-muted",
    onClick: () => setMenuOpen(false)
  }, t("nav_about")), /*#__PURE__*/React.createElement(Link, {
    href: "/register/producer",
    className: "block text-primary font-semibold",
    onClick: () => setMenuOpen(false)
  }, t("nav_add_business")), /*#__PURE__*/React.createElement("button", {
    onClick: () => setLang(lang === "he" ? "en" : "he"),
    className: "text-sm text-site-muted border border-border rounded-full px-3 py-1 inline-flex items-center gap-1.5",
    "aria-label": lang === "he" ? "Switch to English" : "החלף לעברית"
  }, /*#__PURE__*/React.createElement("span", {
    className: lang === "he" ? "font-bold text-primary" : ""
  }, "\u05E2\u05D1"), /*#__PURE__*/React.createElement("span", {
    className: "text-border"
  }, "/"), /*#__PURE__*/React.createElement("span", {
    className: lang === "en" ? "font-bold text-primary" : ""
  }, "EN")), user ? /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(Link, {
    href: "/favorites",
    className: "flex items-center gap-1 text-site-muted",
    onClick: () => setMenuOpen(false)
  }, /*#__PURE__*/React.createElement(Heart, {
    size: 16,
    weight: "duotone",
    "aria-hidden": "true"
  }), t("nav_favorites")), user.role === "admin" && /*#__PURE__*/React.createElement(Link, {
    href: "/admin",
    className: "block text-secondary",
    onClick: () => setMenuOpen(false)
  }, t("nav_admin")), /*#__PURE__*/React.createElement("button", {
    onClick: () => {
      logout();
      setMenuOpen(false);
    },
    className: "block text-red-500"
  }, t("nav_logout"))) : /*#__PURE__*/React.createElement(Link, {
    href: "/login",
    className: "block text-site-muted",
    onClick: () => setMenuOpen(false)
  }, t("nav_login"))));
}
Object.assign(__ds_scope, { Header });
})(); } catch (e) { __ds_ns.__errors.push({ path: "source/Header.jsx", error: String((e && e.message) || e) }); }

// source/ProducerCard.jsx
try { (() => {
"use client";

function WhatsAppIcon({
  className
}) {
  return /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 24 24",
    className: className,
    fill: "currentColor",
    "aria-hidden": "true"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M20.52 3.48A11.9 11.9 0 0012.04 0C5.45 0 .1 5.35.1 11.94c0 2.1.55 4.15 1.6 5.96L0 24l6.27-1.64a11.9 11.9 0 005.77 1.47h.01c6.59 0 11.94-5.35 11.94-11.94 0-3.19-1.24-6.19-3.47-8.41zM12.04 21.8a9.86 9.86 0 01-5.03-1.38l-.36-.21-3.72.97.99-3.62-.23-.37a9.84 9.84 0 01-1.51-5.25c0-5.45 4.44-9.88 9.9-9.88a9.87 9.87 0 017 2.89 9.83 9.83 0 012.9 7c-.01 5.45-4.45 9.85-9.94 9.85zm5.43-7.4c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15s-.77.97-.94 1.17c-.17.2-.35.22-.65.07-.3-.15-1.25-.46-2.38-1.47-.88-.78-1.47-1.75-1.65-2.04-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.07-.15-.67-1.61-.92-2.2-.24-.58-.49-.5-.67-.51l-.57-.01c-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.48 0 1.46 1.07 2.88 1.22 3.08.15.2 2.1 3.2 5.08 4.49.71.3 1.26.49 1.69.63.71.22 1.36.19 1.87.12.57-.09 1.76-.72 2-1.41.25-.7.25-1.29.17-1.41-.07-.12-.27-.2-.57-.34z"
  }));
}
function PhoneIcon({
  className
}) {
  return /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 24 24",
    className: className,
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": "true"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"
  }));
}
function InstagramIcon({
  className
}) {
  return /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 24 24",
    className: className,
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": "true"
  }, /*#__PURE__*/React.createElement("rect", {
    x: "2",
    y: "2",
    width: "20",
    height: "20",
    rx: "5",
    ry: "5"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "17.5",
    y1: "6.5",
    x2: "17.51",
    y2: "6.5"
  }));
}
function ProducerCard({
  producer,
  active,
  onClick,
  referrer
}) {
  // FINAL_AUDIT: Cloudinary f_auto,q_auto — WebP/AVIF automatic delivery.
  const imgSrc = optimizeCloudinary(producer.images?.[0]);
  // tasks_for_claude_code.md task 17: shared normalizer replaces the
  // previous inline logic that had an order-of-operations bug on inputs
  // with leading whitespace. See lib/utils.js.
  const whatsappNumber = normalizePhone(producer.phone) || null;
  // feature/producer-analytics — append ?from={referrer} so the producer
  // dashboard's search_appearances metric can tell search-referred views
  // apart from direct / bookmark views. Callers: ProducersGrid on the
  // homepage passes "home"; /map passes "map"; the category pill filter
  // passes "category". No referrer → direct/unknown view.
  const baseHref = producer.slug ? `/${producer.slug}` : `/producer/${producer.id}`;
  const producerHref = referrer ? `${baseHref}?from=${referrer}` : baseHref;
  const priceLabel = producer.price_range || producer.starting_price_label;
  const handleRootClick = e => {
    if (onClick) {
      // Don't hijack clicks on child interactive elements
      if (e.target.closest("a, button")) return;
      onClick(producer);
    }
  };
  return /*#__PURE__*/React.createElement("article", {
    onClick: handleRootClick,
    className: ["bg-background overflow-hidden border transition flex flex-col", "hover:shadow-[0_8px_32px_rgba(46,104,83,0.12)] hover:-translate-y-0.5", active ? "border-primary ring-2 ring-primary" : "border-border", onClick ? "cursor-pointer" : ""].join(" "),
    style: {
      borderRadius: "16px"
    }
  }, /*#__PURE__*/React.createElement(Link, {
    href: producerHref
  }, /*#__PURE__*/React.createElement("div", {
    className: "relative w-full bg-light h-[140px] md:h-[200px]",
    style: {
      borderRadius: "16px 16px 0 0",
      overflow: "hidden"
    }
  }, imgSrc ? /*#__PURE__*/React.createElement(Image, {
    src: imgSrc,
    alt: producer.name,
    fill: true,
    className: "object-cover transition duration-300 hover:scale-105",
    sizes: "(max-width: 768px) 50vw, (max-width: 1200px) 50vw, 25vw"
  }) : /*#__PURE__*/React.createElement("div", {
    className: "absolute inset-0 flex flex-col items-center justify-center text-primary",
    "aria-label": `${producer.name} — תמונה חסרה`
  }, /*#__PURE__*/React.createElement(Leaf, {
    size: 56,
    weight: "duotone",
    "aria-hidden": "true"
  }), /*#__PURE__*/React.createElement("span", {
    className: "font-headline text-sm mt-1 opacity-70"
  }, "\u05DE\u05D4\u05DE\u05E7\u05D5\u05E8")), producer.is_verified && /*#__PURE__*/React.createElement("span", {
    className: "absolute top-3 left-3 bg-primary text-white text-xs px-2 py-1 rounded-full inline-flex items-center gap-1"
  }, /*#__PURE__*/React.createElement(Seal, {
    size: 14,
    weight: "fill",
    "aria-hidden": "true"
  }), "\u05DE\u05D0\u05D5\u05DE\u05EA"), producer.plan === "premium" && /*#__PURE__*/React.createElement("span", {
    className: "absolute top-3 right-3 bg-accent text-white text-xs px-2 py-1 rounded-full"
  }, "\u05E4\u05E8\u05DE\u05D9\u05D5\u05DD"), producer.is_available_today && /*#__PURE__*/React.createElement("span", {
    className: "absolute bottom-3 right-3 bg-secondary text-white text-xs px-2 py-1 rounded-full font-semibold"
  }, "\u05D6\u05DE\u05D9\u05DF \u05D4\u05D9\u05D5\u05DD"))), /*#__PURE__*/React.createElement("div", {
    className: "p-4 flex-1 flex flex-col"
  }, /*#__PURE__*/React.createElement(Link, {
    href: producerHref
  }, /*#__PURE__*/React.createElement("h3", {
    className: "font-headline font-bold text-site-text hover:text-primary transition leading-snug truncate",
    style: {
      fontSize: "18px"
    }
  }, producer.name)), /*#__PURE__*/React.createElement("p", {
    className: "text-[13px] text-site-muted mt-1 truncate"
  }, producer.city, producer.categories?.[0] && /*#__PURE__*/React.createElement(React.Fragment, null, " \xB7 ", producer.categories[0].emoji, " ", producer.categories[0].name)), producer.reviews_count > 0 && /*#__PURE__*/React.createElement("p", {
    className: "text-xs text-site-muted mt-1"
  }, "\u2B50 ", Number(producer.avg_rating).toFixed(1), /*#__PURE__*/React.createElement("span", {
    className: "mr-1"
  }, "(", producer.reviews_count, ")")), producer.top_product_name && /*#__PURE__*/React.createElement("p", {
    className: "text-sm text-site-text/85 mt-2 truncate"
  }, producer.top_product_name), /*#__PURE__*/React.createElement("div", {
    className: "flex flex-wrap mt-2",
    style: {
      gap: "6px"
    }
  }, producer.organic_certified && /*#__PURE__*/React.createElement("span", {
    className: "bg-light text-primary inline-flex items-center gap-1",
    style: {
      borderRadius: "20px",
      padding: "3px 10px",
      fontSize: "12px"
    }
  }, /*#__PURE__*/React.createElement(Leaf, {
    size: 14,
    weight: "duotone",
    "aria-hidden": "true"
  }), "\u05D0\u05D5\u05E8\u05D2\u05E0\u05D9"), producer.grass_fed && /*#__PURE__*/React.createElement("span", {
    className: "bg-light text-primary inline-flex items-center gap-1",
    style: {
      borderRadius: "20px",
      padding: "3px 10px",
      fontSize: "12px"
    }
  }, /*#__PURE__*/React.createElement(Cow, {
    size: 14,
    weight: "duotone",
    "aria-hidden": "true"
  }), "\u05D2\u05E8\u05D0\u05E1 \u05E4\u05D3"), producer.kosher && /*#__PURE__*/React.createElement("span", {
    className: "bg-light text-primary",
    style: {
      borderRadius: "20px",
      padding: "3px 10px",
      fontSize: "12px"
    }
  }, "\u2721\uFE0F ", producer.kosher), producer.categories?.slice(0, 1).map(cat => /*#__PURE__*/React.createElement(__ds_scope.CategoryTag, {
    key: cat.id,
    category: cat
  }))), /*#__PURE__*/React.createElement("div", {
    className: "mt-auto flex items-center justify-between border-t border-border",
    style: {
      padding: "12px 0 0 0",
      marginTop: "16px"
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center",
    style: {
      gap: "6px"
    }
  }, whatsappNumber && /*#__PURE__*/React.createElement("a", {
    href: `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(`היי! מצאתי אותך במהמקור — ${producer.name}`)}`,
    target: "_blank",
    rel: "noopener noreferrer",
    title: "WhatsApp",
    "aria-label": "\u05E9\u05DC\u05D7 \u05D4\u05D5\u05D3\u05E2\u05D4 \u05D1\u05D5\u05D5\u05D8\u05E1\u05D0\u05E4",
    onClick: e => e.stopPropagation(),
    className: "inline-flex items-center justify-center rounded-full hover:bg-light transition text-primary",
    style: {
      width: "44px",
      height: "44px"
    }
  }, /*#__PURE__*/React.createElement(WhatsAppIcon, {
    className: "w-5 h-5"
  })), producer.phone && /*#__PURE__*/React.createElement("a", {
    href: `tel:${producer.phone}`,
    title: "\u05D8\u05DC\u05E4\u05D5\u05DF",
    "aria-label": "\u05D4\u05EA\u05E7\u05E9\u05E8 \u05DC\u05D1\u05D9\u05EA \u05D4\u05E2\u05E1\u05E7",
    onClick: e => e.stopPropagation(),
    className: "inline-flex items-center justify-center rounded-full hover:bg-light transition text-primary",
    style: {
      width: "44px",
      height: "44px"
    }
  }, /*#__PURE__*/React.createElement(PhoneIcon, {
    className: "w-5 h-5"
  })), producer.instagram && /*#__PURE__*/React.createElement("a", {
    href: `https://instagram.com/${producer.instagram}`,
    target: "_blank",
    rel: "noopener noreferrer",
    title: "Instagram",
    "aria-label": "\u05E2\u05DE\u05D5\u05D3 \u05D0\u05D9\u05E0\u05E1\u05D8\u05D2\u05E8\u05DD",
    onClick: e => e.stopPropagation(),
    className: "inline-flex items-center justify-center rounded-full hover:bg-light transition text-primary",
    style: {
      width: "44px",
      height: "44px"
    }
  }, /*#__PURE__*/React.createElement(InstagramIcon, {
    className: "w-5 h-5"
  }))), /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-3"
  }, priceLabel && /*#__PURE__*/React.createElement("span", {
    className: "font-body font-semibold text-accent text-sm"
  }, priceLabel), /*#__PURE__*/React.createElement(Link, {
    href: producerHref,
    className: "border border-primary text-primary text-[13px] hover:bg-primary hover:text-white transition",
    style: {
      borderRadius: "8px",
      padding: "6px 14px"
    }
  }, "\u05DE\u05D9\u05D3\u05E2 \u05E0\u05D5\u05E1\u05E3")))));
}
Object.assign(__ds_scope, { ProducerCard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "source/ProducerCard.jsx", error: String((e && e.message) || e) }); }

// source/page.js
try { (() => {
"use client";

const {
  useEffect,
  useState
} = React;
const PAGE_SIZE = 8;

// OPTIMIZE: `auto=format` → Unsplash serves WebP/AVIF when supported;
// `q=80` drops ~30% bytes with no perceptible quality loss on a parallax bg.
const HERO_IMAGE = "https://images.unsplash.com/photo-1542838132-92c53300491e?w=1920&auto=format&q=80&fm=webp";

// PREMIUM_DESIGN: parallax divider images between sections.
const PARALLAX_IMAGE_1 = "https://images.unsplash.com/photo-1488459716781-31db52582fe9?w=1600&auto=format&q=80&fm=webp";
const PARALLAX_IMAGE_2 = "https://images.unsplash.com/photo-1464226184884-fa280b87c399?w=1600&auto=format&q=80&fm=webp";

// PREMIUM_DESIGN: category cards now use hand-drawn SVG line-art
// (see CategoryIcons.jsx) instead of Phosphor — warmer, more unique
// than a generic icon library. Match-terms + Unsplash images unchanged.
const CATEGORY_CARDS = [{
  key: "meat",
  name: "בשר, עוף ודגים",
  match: ["בשר", "עוף", "דגים"],
  image: "https://images.unsplash.com/photo-1607623814075-e51df1bdc82f?w=600&fit=crop&auto=format&q=80&fm=webp"
}, {
  key: "veg",
  name: "ירקות, פירות ומשקים",
  match: ["ירקות", "פירות", "משקה"],
  image: "https://images.unsplash.com/photo-1540420773420-3366772f4999?w=600&fit=crop&auto=format&q=80&fm=webp"
}, {
  key: "dairy",
  name: "חלב וגבינות",
  match: ["חלב", "גבינה", "גבינות"],
  image: "https://images.unsplash.com/photo-1771578742735-36009188c207?w=600&fit=crop&auto=format&q=80&fm=webp"
}, {
  key: "bread",
  name: "לחמים ואפייה",
  match: ["לחם", "אפייה", "מאפים"],
  image: "https://images.unsplash.com/photo-1509440159596-0249088772ff?w=600&fit=crop&auto=format&q=80&fm=webp"
}, {
  key: "oil",
  name: "שמנים ודבש",
  match: ["שמן", "דבש"],
  image: "https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=600&fit=crop&auto=format&q=80&fm=webp"
}, {
  key: "care",
  name: "טיפוח וסבונים",
  match: ["טיפוח", "סבון", "קוסמטיקה"],
  image: "https://images.unsplash.com/photo-1600857544200-b2f666a9a2ec?w=600&fit=crop&auto=format&q=80&fm=webp"
}];

// PREMIUM_DESIGN: hype tags that scroll in the marquee between sections.
const MARQUEE_ITEMS = ["🌿 ללא מעובד", "🥩 ממרעה", "🧀 אורגני", "🍞 מחמצת", "🫒 כתית", "🌱 טרי ואמיתי", "✅ מאומת", "📍 מקומי"];
function matchCategoryId(cards, categories) {
  return cards.map(card => {
    const found = categories.find(c => card.match.some(m => c.name && c.name.includes(m)));
    return {
      ...card,
      categoryId: found ? found.id : null
    };
  });
}
function HomePage() {
  const {
    user
  } = useAuth();
  const {
    t
  } = useLanguage();
  const [producers, setProducers] = useState([]);
  const [homeProducts, setHomeProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [filters, setFilters] = useState({
    category: "",
    delivery_city: "",
    has_delivery: false
  });
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [searchQuery, setSearchQuery] = useState("");
  const [stats, setStats] = useState({
    producers_count: 0,
    categories_count: 0
  });
  const [producersLoading, setProducersLoading] = useState(true);
  const [geoLoading, setGeoLoading] = useState(false);
  const [chips, setChips] = useState({
    kosher: false,
    organic: false,
    has_delivery: false,
    verified: false
  });
  const [recentlyViewed, setRecentlyViewed] = useState([]);
  useEffect(() => {
    api.get("/categories").then(r => setCategories(r.data)).catch(() => {});
    loadProducers();
    // Home-kitchen preview — just the 3 most recent, no filter.
    // Full browse + filter lives on /neighbor.
    api.get("/home-products").then(r => setHomeProducts(r.data)).catch(() => setHomeProducts([]));
    api.get("/stats").then(r => setStats(r.data)).catch(() => {});
    // Task 13: load recently viewed producers from localStorage
    try {
      const ids = JSON.parse(localStorage.getItem("recently_viewed") || "[]");
      if (ids.length > 0) {
        Promise.all(ids.map(id => api.get(`/producers/${id}`).then(r => r.data).catch(() => null))).then(results => setRecentlyViewed(results.filter(Boolean)));
      }
    } catch {
      // localStorage unavailable
    }
  }, []);
  const loadProducers = (params = {}) => {
    setProducersLoading(true);
    api.get("/producers", {
      params
    }).then(r => {
      setProducers(r.data);
      setVisibleCount(PAGE_SIZE);
    }).finally(() => setProducersLoading(false));
  };
  const handleSearch = e => {
    e.preventDefault();
    const cp = chipParams();
    if (!searchQuery.trim()) {
      loadProducers(cp);
    } else {
      loadProducers({
        delivery_city: searchQuery,
        ...cp
      });
    }
    document.getElementById("producers-grid")?.scrollIntoView({
      behavior: "smooth"
    });
  };
  const handleCategoryCardClick = card => {
    if (!card.categoryId) return;
    const newCat = String(card.categoryId);
    setFilters({
      ...filters,
      category: newCat
    });
    loadProducers({
      category: newCat,
      ...chipParams()
    });
    document.getElementById("producers-grid")?.scrollIntoView({
      behavior: "smooth"
    });
  };
  const handleWhatsAppClick = async productId => {
    if (!user) return;
    try {
      await api.post(`/home-products/${productId}/whatsapp-click`);
    } catch {
      // ignore
    }
  };
  const scrollToProducers = () => {
    document.getElementById("producers-grid")?.scrollIntoView({
      behavior: "smooth"
    });
  };

  // Build query params from active chips. Called by loadProducers callers
  // and the chip toggle handler so every filter surface stays in sync.
  const chipParams = (overrides = {}) => {
    const c = {
      ...chips,
      ...overrides
    };
    const p = {};
    if (c.kosher) p.kosher = true;
    if (c.organic) p.organic = true;
    if (c.has_delivery) p.has_delivery = true;
    if (c.verified) p.verified = true;
    return p;
  };
  const toggleChip = key => {
    const next = {
      ...chips,
      [key]: !chips[key]
    };
    setChips(next);
    const params = chipParams({
      [key]: !chips[key]
    });
    if (filters.category) params.category = filters.category;
    loadProducers(params);
  };
  const handleNearMe = () => {
    if (!navigator.geolocation) {
      showToast("אפשרי גישה למיקום בהגדרות הדפדפן", "error");
      return;
    }
    setGeoLoading(true);
    navigator.geolocation.getCurrentPosition(pos => {
      loadProducers({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        radius_km: 15,
        ...chipParams()
      });
      setGeoLoading(false);
      document.getElementById("producers-grid")?.scrollIntoView({
        behavior: "smooth"
      });
    }, () => {
      setGeoLoading(false);
      showToast("אפשרי גישה למיקום בהגדרות הדפדפן", "error");
    });
  };
  const visibleProducers = producers.slice(0, visibleCount);
  const hasMore = visibleCount < producers.length;
  const categoryCards = matchCategoryId(CATEGORY_CARDS, categories);
  const statsProducersCount = stats.producers_count || producers.length;
  const statsCategoriesCount = stats.categories_count || categories.length || 6;

  // Newest producers (last 4 by created_at if available, else first 4)
  const newestProducers = [...producers].sort((a, b) => (b.created_at || "").localeCompare(a.created_at || "")).slice(0, 4);
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("section", {
    className: "relative w-full overflow-hidden",
    style: {
      height: "100vh"
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "kenburns-right absolute",
    style: {
      inset: "-5%",
      backgroundImage: `url(${HERO_IMAGE})`,
      backgroundSize: "cover",
      backgroundPosition: "center"
    }
  }), /*#__PURE__*/React.createElement("div", {
    className: "absolute inset-0",
    style: {
      background: "linear-gradient(to top, rgba(46,74,46,0.88) 0%, rgba(46,74,46,0.40) 50%, rgba(0,0,0,0.10) 100%)"
    }
  }), /*#__PURE__*/React.createElement("div", {
    className: "absolute left-0 right-0 text-center px-4 text-white",
    style: {
      bottom: "25%"
    }
  }, /*#__PURE__*/React.createElement(motion.h1, {
    initial: {
      opacity: 0,
      y: 60
    },
    animate: {
      opacity: 1,
      y: 0
    },
    transition: {
      duration: 0.9,
      ease: [0.25, 0.46, 0.45, 0.94]
    },
    className: "font-headline font-bold leading-tight",
    style: {
      fontSize: "clamp(42px, 6vw, 80px)",
      lineHeight: 1.15
    }
  }, t("hero_title")), /*#__PURE__*/React.createElement(motion.p, {
    initial: {
      opacity: 0,
      y: 30
    },
    animate: {
      opacity: 1,
      y: 0
    },
    transition: {
      duration: 0.9,
      delay: 0.2,
      ease: [0.25, 0.46, 0.45, 0.94]
    },
    className: "font-body mt-3 text-light",
    style: {
      fontSize: "18px",
      letterSpacing: "0.12em",
      textTransform: "uppercase"
    }
  }, t("hero_subtitle")), /*#__PURE__*/React.createElement(motion.form, {
    initial: {
      opacity: 0,
      y: 30
    },
    animate: {
      opacity: 1,
      y: 0
    },
    transition: {
      duration: 0.9,
      delay: 0.4,
      ease: [0.25, 0.46, 0.45, 0.94]
    },
    onSubmit: handleSearch,
    role: "search",
    className: "mx-auto mt-8 bg-white shadow-lg flex items-center gap-2 px-5 py-3",
    style: {
      borderRadius: "50px",
      width: "min(580px, 88vw)"
    }
  }, /*#__PURE__*/React.createElement("svg", {
    className: "w-5 h-5 text-primary shrink-0",
    fill: "none",
    stroke: "currentColor",
    viewBox: "0 0 24 24",
    "aria-hidden": "true"
  }, /*#__PURE__*/React.createElement("path", {
    strokeLinecap: "round",
    strokeLinejoin: "round",
    strokeWidth: 2,
    d: "M21 21l-4.35-4.35M17 10a7 7 0 11-14 0 7 7 0 0114 0z"
  })), /*#__PURE__*/React.createElement("label", {
    htmlFor: "hero-search",
    className: "sr-only"
  }, t("search_sr_label")), /*#__PURE__*/React.createElement("input", {
    id: "hero-search",
    type: "text",
    value: searchQuery,
    onChange: e => setSearchQuery(e.target.value),
    placeholder: t("search_placeholder"),
    className: "flex-1 bg-transparent outline-none text-site-text placeholder:text-site-muted text-base focus-visible:ring-2 focus-visible:ring-primary/40 rounded-full"
  }), /*#__PURE__*/React.createElement("button", {
    type: "submit",
    className: "sr-only",
    "aria-label": "\u05D1\u05E6\u05E2 \u05D7\u05D9\u05E4\u05D5\u05E9"
  }, "\u05D7\u05D9\u05E4\u05D5\u05E9")), /*#__PURE__*/React.createElement(motion.div, {
    initial: {
      opacity: 0,
      y: 20
    },
    animate: {
      opacity: 1,
      y: 0
    },
    transition: {
      duration: 0.7,
      delay: 0.6,
      ease: [0.25, 0.46, 0.45, 0.94]
    },
    className: "mt-4"
  }, /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: handleNearMe,
    disabled: geoLoading,
    className: "inline-flex items-center gap-2 bg-white/15 backdrop-blur-sm text-white border border-white/30 px-5 py-2.5 rounded-full hover:bg-white/25 transition font-medium text-sm disabled:opacity-50"
  }, /*#__PURE__*/React.createElement(Crosshair, {
    size: 18,
    weight: "bold",
    className: geoLoading ? "animate-spin" : "",
    "aria-hidden": "true"
  }), geoLoading ? "מחפשת..." : "קרוב אלי"))), /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: scrollToProducers,
    className: "absolute left-1/2 -translate-x-1/2 text-white/70 hover:text-white transition-opacity scroll-hint",
    style: {
      bottom: "32px"
    },
    "aria-label": "\u05D2\u05DC\u05D5\u05DC \u05DC\u05E8\u05E9\u05D9\u05DE\u05EA \u05D1\u05EA\u05D9 \u05D4\u05E2\u05E1\u05E7"
  }, /*#__PURE__*/React.createElement("svg", {
    className: "w-7 h-7",
    fill: "none",
    stroke: "currentColor",
    viewBox: "0 0 24 24",
    "aria-hidden": "true"
  }, /*#__PURE__*/React.createElement("path", {
    strokeLinecap: "round",
    strokeLinejoin: "round",
    strokeWidth: 2,
    d: "M19 14l-7 7m0 0l-7-7m7 7V3"
  })))), /*#__PURE__*/React.createElement("section", {
    className: "bg-primary text-white py-4 text-center"
  }, /*#__PURE__*/React.createElement("p", {
    className: "font-body text-lg tracking-wide"
  }, /*#__PURE__*/React.createElement("span", {
    className: "font-semibold tabular-nums"
  }, /*#__PURE__*/React.createElement(AnimatedCounter, {
    target: statsProducersCount
  })), " ", "\u05D1\u05EA\u05D9 \u05E2\u05E1\u05E7 \u05DE\u05D0\u05D5\u05DE\u05EA\u05D9\u05DD \xA0\xB7\xA0", /*#__PURE__*/React.createElement("span", {
    className: "font-semibold tabular-nums"
  }, /*#__PURE__*/React.createElement(AnimatedCounter, {
    target: statsCategoriesCount
  })), " ", "\u05E7\u05D8\u05D2\u05D5\u05E8\u05D9\u05D5\u05EA \xA0\xB7\xA0 \u05DE\u05DB\u05DC \u05E8\u05D7\u05D1\u05D9 \u05D4\u05D0\u05E8\u05E5")), /*#__PURE__*/React.createElement("section", {
    className: "max-w-7xl mx-auto px-4 section-y"
  }, /*#__PURE__*/React.createElement(FadeInSection, {
    className: "text-center mb-10"
  }, /*#__PURE__*/React.createElement("h2", {
    className: "font-headline font-bold text-site-text mb-2",
    style: {
      fontSize: "clamp(32px, 4vw, 48px)"
    }
  }, "\u05D2\u05DC\u05D9 \u05DC\u05E4\u05D9 \u05E7\u05D8\u05D2\u05D5\u05E8\u05D9\u05D4"), /*#__PURE__*/React.createElement("p", {
    className: "text-site-muted text-base"
  }, "\u05D9\u05E9\u05E8 \u05DE\u05D1\u05D9\u05EA \u05D4\u05E2\u05E1\u05E7 \u2014 \u05D1\u05DC\u05D9 \u05DE\u05EA\u05D5\u05D5\u05DB\u05D9\u05DD")), /*#__PURE__*/React.createElement("div", {
    className: "grid grid-cols-2 md:grid-cols-2 lg:grid-cols-3",
    style: {
      gap: "20px"
    }
  }, categoryCards.map((card, idx) => {
    // PREMIUM_DESIGN: hand-drawn line-art icon per category.
    const LineArt = CATEGORY_ICONS[card.key];
    return /*#__PURE__*/React.createElement(motion.button, {
      key: card.key,
      initial: {
        opacity: 0,
        y: 40
      },
      whileInView: {
        opacity: 1,
        y: 0
      },
      viewport: {
        once: true,
        amount: 0.2
      },
      transition: {
        duration: 0.6,
        delay: idx * 0.08,
        ease: [0.25, 0.46, 0.45, 0.94]
      },
      onClick: () => handleCategoryCardClick(card),
      className: "group relative overflow-hidden cursor-pointer text-right h-[140px] md:h-[280px]",
      style: {
        borderRadius: "16px",
        backgroundImage: `url(${card.image})`,
        backgroundSize: "cover",
        backgroundPosition: "center"
      },
      "aria-label": `הצג קטגוריה: ${card.name}`
    }, /*#__PURE__*/React.createElement("div", {
      className: "absolute inset-0 transition-all duration-500 ease-out",
      style: {
        backgroundColor: "rgba(46,104,83,0.65)"
      }
    }), /*#__PURE__*/React.createElement("div", {
      className: "absolute inset-0 opacity-0 group-hover:opacity-100 transition-all duration-500 ease-out",
      style: {
        backgroundColor: "rgba(46,104,83,0.45)"
      }
    }), /*#__PURE__*/React.createElement("div", {
      className: "relative z-10 h-full w-full flex flex-col items-center justify-center text-white transition-transform duration-500 ease-out group-hover:scale-[1.06]"
    }, LineArt && /*#__PURE__*/React.createElement(LineArt, {
      size: 64,
      className: "w-8 h-8 md:w-16 md:h-16",
      stroke: "white",
      strokeWidth: 1.75
    }), /*#__PURE__*/React.createElement("h3", {
      className: "font-headline font-bold mt-2 md:mt-3 text-sm md:text-[22px]"
    }, card.name)));
  }))), /*#__PURE__*/React.createElement("div", {
    className: "bg-primary overflow-hidden marquee-edge-fade",
    style: {
      padding: "14px 0",
      borderTop: "1px solid rgba(255,255,255,0.1)",
      borderBottom: "1px solid rgba(255,255,255,0.1)"
    },
    "aria-hidden": "true"
  }, /*#__PURE__*/React.createElement("div", {
    className: "marquee-track"
  }, [0, 1].map(loop => /*#__PURE__*/React.createElement("div", {
    key: loop,
    className: "flex items-center",
    style: {
      gap: "48px"
    }
  }, MARQUEE_ITEMS.map(text => /*#__PURE__*/React.createElement("span", {
    key: `${loop}-${text}`,
    className: "font-body whitespace-nowrap text-light",
    style: {
      fontSize: 14,
      letterSpacing: "0.06em"
    }
  }, text)))))), /*#__PURE__*/React.createElement(FadeInSection, {
    className: "max-w-4xl mx-auto px-4 mb-8"
  }, /*#__PURE__*/React.createElement(Link, {
    href: "/about",
    className: "group flex items-center gap-6 bg-white rounded-[20px] border border-border p-6 md:p-8 hover:shadow-[0_4px_24px_rgba(46,104,83,0.08)] transition focus-visible:ring-2 focus-visible:ring-primary/40"
  }, /*#__PURE__*/React.createElement("div", {
    className: "w-20 h-20 rounded-full bg-light flex items-center justify-center shrink-0",
    "aria-hidden": "true"
  }, /*#__PURE__*/React.createElement(Leaf, {
    size: 36,
    weight: "duotone",
    className: "text-primary"
  })), /*#__PURE__*/React.createElement("div", {
    className: "flex-1"
  }, /*#__PURE__*/React.createElement("p", {
    className: "font-headline italic text-site-text text-lg md:text-xl leading-relaxed mb-2"
  }, "\u201C\u05D0\u05D5\u05DB\u05DC \u05D0\u05DE\u05D9\u05EA\u05D9, \u05DE\u05D0\u05E0\u05E9\u05D9\u05DD \u05D0\u05DE\u05D9\u05EA\u05D9\u05D9\u05DD, \u05DE\u05DE\u05E9 \u05DC\u05D9\u05D3 \u05D4\u05D1\u05D9\u05EA.\u201D"), /*#__PURE__*/React.createElement("p", {
    className: "font-body text-sm text-primary group-hover:underline"
  }, "\u05E1\u05E4\u05D9\u05E8, \u05DE\u05D9\u05D9\u05E1\u05D3\u05EA \u05DE\u05D4\u05DE\u05E7\u05D5\u05E8 \u2192")))), recentlyViewed.length > 0 && /*#__PURE__*/React.createElement("section", {
    className: "max-w-7xl mx-auto px-4 pb-10"
  }, /*#__PURE__*/React.createElement("h2", {
    className: "font-headline font-bold text-site-text mb-4",
    style: {
      fontSize: "clamp(22px, 2.5vw, 28px)"
    }
  }, "\u05D1\u05D9\u05E7\u05E8\u05EA \u05DC\u05D0\u05D7\u05E8\u05D5\u05E0\u05D4"), /*#__PURE__*/React.createElement("div", {
    className: "flex gap-4 overflow-x-auto pb-2 scrollbar-hide -mx-1 px-1"
  }, recentlyViewed.map(p => {
    const href = p.slug ? `/${p.slug}` : `/producer/${p.id}`;
    const imgSrc = p.images?.[0];
    return /*#__PURE__*/React.createElement(Link, {
      key: p.id,
      href: href,
      className: "shrink-0 w-[160px] bg-background border border-border rounded-[12px] overflow-hidden hover:shadow-md transition group"
    }, /*#__PURE__*/React.createElement("div", {
      className: "relative w-full h-[100px] bg-light overflow-hidden"
    }, imgSrc ? /*#__PURE__*/React.createElement("img", {
      src: imgSrc,
      alt: p.name,
      className: "w-full h-full object-cover group-hover:scale-105 transition duration-300"
    }) : /*#__PURE__*/React.createElement("div", {
      className: "flex items-center justify-center h-full text-primary"
    }, /*#__PURE__*/React.createElement(Leaf, {
      size: 32,
      weight: "duotone",
      "aria-hidden": "true"
    }))), /*#__PURE__*/React.createElement("div", {
      className: "p-2.5"
    }, /*#__PURE__*/React.createElement("p", {
      className: "font-headline font-bold text-sm text-site-text truncate"
    }, p.name), /*#__PURE__*/React.createElement("p", {
      className: "text-xs text-site-muted truncate"
    }, p.city)));
  }))), /*#__PURE__*/React.createElement("section", {
    id: "producers-grid",
    className: "max-w-7xl mx-auto px-4 pb-20"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center justify-between mb-8"
  }, /*#__PURE__*/React.createElement("h2", {
    className: "font-headline font-bold text-site-text",
    style: {
      fontSize: "clamp(28px, 3.5vw, 40px)"
    }
  }, "\u05D1\u05EA\u05D9 \u05E2\u05E1\u05E7 \u05DE\u05D5\u05DE\u05DC\u05E6\u05D9\u05DD"), /*#__PURE__*/React.createElement(Link, {
    href: "/map",
    className: "text-primary hover:underline flex items-center gap-1"
  }, "\u05D4\u05E6\u05D2 \u05D1\u05DE\u05E4\u05D4 \uD83D\uDDFA\uFE0F")), /*#__PURE__*/React.createElement("div", {
    className: "flex gap-2 mb-6 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide"
  }, [{
    key: "kosher",
    label: "כשר",
    icon: "✡️"
  }, {
    key: "organic",
    label: "אורגני",
    icon: "🌿"
  }, {
    key: "has_delivery",
    label: "משלוח",
    icon: "🚚"
  }, {
    key: "verified",
    label: "מאומת בלבד",
    icon: "✅"
  }].map(chip => /*#__PURE__*/React.createElement("button", {
    key: chip.key,
    type: "button",
    onClick: () => toggleChip(chip.key),
    className: `inline-flex items-center gap-1.5 whitespace-nowrap px-4 py-2 rounded-full text-sm font-medium border transition shrink-0 ${chips[chip.key] ? "bg-primary text-white border-primary" : "bg-white text-site-text border-border hover:border-primary hover:text-primary"}`
  }, /*#__PURE__*/React.createElement("span", {
    "aria-hidden": "true"
  }, chip.icon), chip.label))), filters.category && /*#__PURE__*/React.createElement("div", {
    className: "mb-6 flex items-center gap-2"
  }, /*#__PURE__*/React.createElement("span", {
    className: "text-sm text-site-muted"
  }, "\u05DE\u05E6\u05D9\u05D2:"), categories.find(c => String(c.id) === filters.category) && /*#__PURE__*/React.createElement("span", {
    className: "bg-light text-primary px-3 py-1 rounded-full text-sm"
  }, categories.find(c => String(c.id) === filters.category).emoji, " ", categories.find(c => String(c.id) === filters.category).name), /*#__PURE__*/React.createElement("button", {
    onClick: () => {
      setFilters({
        ...filters,
        category: ""
      });
      loadProducers(chipParams());
    },
    className: "text-sm text-primary hover:underline"
  }, "\u05E0\u05E7\u05D4 \u05E1\u05D9\u05E0\u05D5\u05DF")), producersLoading ? /*#__PURE__*/React.createElement(SkeletonProducerGrid, {
    count: 8
  }) : /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    className: "grid grid-cols-2 gap-3 md:gap-6 lg:grid-cols-4"
  }, visibleProducers.map((p, idx) => /*#__PURE__*/React.createElement(motion.div, {
    key: p.id,
    initial: {
      opacity: 0,
      y: 40
    },
    whileInView: {
      opacity: 1,
      y: 0
    },
    viewport: {
      once: true,
      amount: 0.1
    },
    transition: {
      duration: 0.5,
      delay: idx % 4 * 0.08,
      ease: [0.25, 0.46, 0.45, 0.94]
    }
  }, /*#__PURE__*/React.createElement(ProducerCard, {
    producer: p,
    referrer: "home"
  })))), producers.length === 0 && /*#__PURE__*/React.createElement("div", {
    className: "text-center py-16"
  }, /*#__PURE__*/React.createElement("div", {
    className: "inline-flex items-center justify-center w-20 h-20 rounded-full bg-light mb-4",
    "aria-hidden": "true"
  }, /*#__PURE__*/React.createElement(Leaf, {
    size: 36,
    weight: "duotone",
    className: "text-primary"
  })), /*#__PURE__*/React.createElement("h3", {
    className: "font-headline text-xl font-bold text-site-text mb-2"
  }, "\u05DC\u05D0 \u05DE\u05E6\u05D0\u05E0\u05D5 \u05E2\u05E1\u05E7\u05D9\u05DD \u05D1\u05D0\u05D6\u05D5\u05E8 \u05D4\u05D6\u05D4 \u2014 \u05E2\u05D3\u05D9\u05D9\u05DF \uD83C\uDF31"), /*#__PURE__*/React.createElement("p", {
    className: "text-site-muted mb-5 max-w-md mx-auto"
  }, "\u05E0\u05E1\u05D9 \u05DC\u05E9\u05E0\u05D5\u05EA \u05D0\u05EA \u05D4\u05E1\u05D9\u05E0\u05D5\u05DF, \u05D0\u05D5 \u05D2\u05DC\u05D9 \u05D1\u05EA\u05D9 \u05E2\u05E1\u05E7 \u05E2\u05DC \u05D4\u05DE\u05E4\u05D4"), /*#__PURE__*/React.createElement(Link, {
    href: "/map",
    className: "inline-flex items-center gap-2 bg-primary text-white px-6 py-3 rounded-[16px] hover:bg-primary-light transition font-medium"
  }, "\u05D2\u05DC\u05D9 \u05E2\u05DC \u05D4\u05DE\u05E4\u05D4")), hasMore && /*#__PURE__*/React.createElement("div", {
    className: "text-center mt-8"
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => setVisibleCount(c => c + PAGE_SIZE),
    className: "bg-white text-primary border-2 border-primary px-8 py-3 rounded-[16px] hover:bg-light transition font-medium"
  }, "\u05E2\u05D5\u05D3 \u05D1\u05EA\u05D9 \u05E2\u05E1\u05E7")))), newestProducers.length > 0 && /*#__PURE__*/React.createElement("section", {
    className: "max-w-7xl mx-auto px-4 pb-20"
  }, /*#__PURE__*/React.createElement("h2", {
    className: "font-headline font-bold text-site-text mb-8",
    style: {
      fontSize: "clamp(26px, 3vw, 36px)"
    }
  }, "\u05E2\u05E1\u05E7\u05D9\u05DD \u05D7\u05D3\u05E9\u05D9\u05DD \u2728"), /*#__PURE__*/React.createElement("div", {
    className: "grid grid-cols-2 gap-3 md:gap-6 lg:grid-cols-4"
  }, newestProducers.map(p => /*#__PURE__*/React.createElement(ProducerCard, {
    key: `new-${p.id}`,
    producer: p,
    referrer: "home"
  })))), /*#__PURE__*/React.createElement(ParallaxQuote, {
    image: PARALLAX_IMAGE_1,
    quote: "\u05DB\u05E9\u05D0\u05EA\u05D4 \u05D9\u05D5\u05D3\u05E2 \u05DE\u05D0\u05D9\u05E4\u05D4 \u05D4\u05D0\u05D5\u05DB\u05DC \u05E9\u05DC\u05DA \u2014 \u05D4\u05DB\u05DC \u05D8\u05D5\u05E2\u05DD \u05D0\u05D7\u05E8\u05EA",
    overlayOpacity: 0.6,
    height: "400px"
  }), /*#__PURE__*/React.createElement("section", {
    className: "max-w-7xl mx-auto px-4 section-y"
  }, /*#__PURE__*/React.createElement(FadeInSection, null, /*#__PURE__*/React.createElement("h2", {
    className: "font-headline font-bold text-site-text text-center mb-10",
    style: {
      fontSize: "clamp(28px, 3.5vw, 40px)"
    }
  }, "\u05D0\u05D9\u05DA \u05D6\u05D4 \u05E2\u05D5\u05D1\u05D3?")), /*#__PURE__*/React.createElement("div", {
    className: "grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl mx-auto"
  }, [{
    step: "01",
    title: "מצאי",
    text: "גלי בתי עסק קרובים אלייך — ירקות טריים, גבינות מהחווה, לחם מחמצת"
  }, {
    step: "02",
    title: "צרי קשר",
    text: "דברי ישירות עם בית העסק בוואטסאפ, בטלפון או באינסטגרם"
  }, {
    step: "03",
    title: "קבלי",
    text: "אוכל אמיתי וטרי, ישר מהמקור — בלי מתווכים, בלי הנחות על האיכות"
  }].map((step, idx) => /*#__PURE__*/React.createElement(FadeInSection, {
    key: step.step,
    delay: idx * 0.12
  }, /*#__PURE__*/React.createElement("div", {
    className: "font-english text-5xl text-accent mb-2"
  }, step.step), /*#__PURE__*/React.createElement("h3", {
    className: "font-headline text-2xl font-bold mb-2"
  }, step.title), /*#__PURE__*/React.createElement("p", {
    className: "text-site-text/85 leading-relaxed"
  }, step.text))))), /*#__PURE__*/React.createElement("section", {
    id: "home-kitchen",
    className: "max-w-7xl mx-auto px-4 section-y border-t border-border scroll-mt-24"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-baseline justify-between mb-6"
  }, /*#__PURE__*/React.createElement("h2", {
    className: "font-headline font-bold text-site-text inline-flex items-center gap-2",
    style: {
      fontSize: "clamp(28px, 3.5vw, 40px)"
    }
  }, /*#__PURE__*/React.createElement(House, {
    size: 32,
    weight: "duotone",
    className: "text-primary",
    "aria-hidden": "true"
  }), "\u05DE\u05D4\u05DE\u05D8\u05D1\u05D7 \u05E9\u05DC \u05D4\u05E9\u05DB\u05DF"), /*#__PURE__*/React.createElement(Link, {
    href: "/neighbor",
    className: "text-primary hover:underline text-sm font-medium whitespace-nowrap"
  }, "\u05E8\u05D0\u05D9 \u05E2\u05D5\u05D3 \u2192")), homeProducts.length > 0 ? /*#__PURE__*/React.createElement("div", {
    className: "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
  }, homeProducts.slice(0, 3).map(hp => /*#__PURE__*/React.createElement(HomeProductCard, {
    key: hp.id,
    product: hp,
    onWhatsAppClick: () => handleWhatsAppClick(hp.id)
  }))) : /*#__PURE__*/React.createElement("p", {
    className: "text-center text-site-muted py-8"
  }, user ? "אין עדיין מוצרים ביתיים." : "אין עדיין מוצרים ביתיים. התחברי כדי לפרסם.", " ", /*#__PURE__*/React.createElement(Link, {
    href: "/neighbor",
    className: "text-primary hover:underline"
  }, "\u05D4\u05E6\u05D8\u05E8\u05E4\u05D9 \u05DC\u05DE\u05D4\u05DE\u05D8\u05D1\u05D7 \u05E9\u05DC \u05D4\u05E9\u05DB\u05DF \u2192"))), /*#__PURE__*/React.createElement(ParallaxQuote, {
    image: PARALLAX_IMAGE_2,
    quote: "\u05DB\u05DC \u05E2\u05D5\u05E0\u05D4 \u2014 \u05D8\u05E2\u05DD \u05D0\u05D7\u05E8",
    overlayOpacity: 0.55,
    height: "340px"
  }), /*#__PURE__*/React.createElement(UpcomingEventsPreview, null), /*#__PURE__*/React.createElement("section", {
    className: "bg-primary-dark text-white py-20"
  }, /*#__PURE__*/React.createElement("div", {
    className: "max-w-3xl mx-auto px-4 text-center"
  }, /*#__PURE__*/React.createElement("h2", {
    className: "font-headline font-bold mb-4",
    style: {
      fontSize: "clamp(32px, 4vw, 52px)"
    }
  }, "\u05D9\u05E9 \u05DC\u05DA \u05E2\u05E1\u05E7? \u05D1\u05D5\u05D0\u05D9 \u05D0\u05DC\u05D9\u05D5"), /*#__PURE__*/React.createElement("p", {
    className: "text-light/90 text-lg mb-8 max-w-xl mx-auto"
  }, "\u05D0\u05DD \u05D0\u05EA \u05D1\u05E2\u05DC\u05EA \u05E2\u05E1\u05E7, \u05D7\u05E7\u05DC\u05D0\u05D9\u05EA \u05D0\u05D5 \u05DE\u05D2\u05D3\u05DC\u05EA \u2014 \u05D4\u05E6\u05D8\u05E8\u05E4\u05D9 \u05DC\u05D3\u05D9\u05E8\u05E7\u05D8\u05D5\u05E8\u05D9 \u05D4\u05E8\u05D0\u05E9\u05D5\u05DF \u05D1\u05D9\u05E9\u05E8\u05D0\u05DC \u05DC\u05D0\u05D5\u05DB\u05DC \u05D0\u05DE\u05D9\u05EA\u05D9."), /*#__PURE__*/React.createElement(Link, {
    href: "/register/producer",
    className: "inline-block bg-white text-primary px-8 py-3 rounded-[12px] hover:bg-light transition font-medium"
  }, "\u05D4\u05D5\u05E1\u05D9\u05E4\u05D9 \u05D0\u05EA \u05D4\u05E2\u05E1\u05E7 \u05E9\u05DC\u05DA \uD83C\uDF3F"))));
}

/**
 * Small inline component for "upcoming events" homepage preview.
 * Pulls from GET /events/upcoming?limit=3. Hides itself if backend returns
 * nothing (e.g. before any events exist).
 */
function UpcomingEventsPreview() {
  const [events, setEvents] = useState([]);
  useEffect(() => {
    api.get("/events/upcoming", {
      params: {
        limit: 3
      }
    }).then(r => setEvents(r.data || [])).catch(() => setEvents([]));
  }, []);
  if (!events.length) return null;
  return /*#__PURE__*/React.createElement("section", {
    className: "max-w-7xl mx-auto px-4 section-y border-t border-border"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-baseline justify-between mb-8"
  }, /*#__PURE__*/React.createElement("h2", {
    className: "font-headline font-bold text-site-text",
    style: {
      fontSize: "clamp(28px, 3.5vw, 40px)"
    }
  }, "\u05D0\u05D9\u05E8\u05D5\u05E2\u05D9\u05DD \u05E7\u05E8\u05D5\u05D1\u05D9\u05DD \uD83D\uDCC5"), /*#__PURE__*/React.createElement(Link, {
    href: "/events",
    className: "text-primary hover:underline text-sm"
  }, "\u05DC\u05DB\u05DC \u05D4\u05D0\u05D9\u05E8\u05D5\u05E2\u05D9\u05DD \u2190")), /*#__PURE__*/React.createElement("div", {
    className: "grid grid-cols-1 md:grid-cols-3 gap-6"
  }, events.map(ev => /*#__PURE__*/React.createElement(Link, {
    key: ev.id,
    href: `/events/${ev.id}`,
    className: "bg-background border border-border rounded-[16px] overflow-hidden hover:shadow-md transition"
  }, ev.image_url && /*#__PURE__*/React.createElement("div", {
    className: "h-40 bg-cover bg-center",
    style: {
      backgroundImage: `url(${ev.image_url})`
    }
  }), /*#__PURE__*/React.createElement("div", {
    className: "p-4"
  }, /*#__PURE__*/React.createElement("p", {
    className: "text-primary text-sm font-semibold mb-1"
  }, formatEventDate(ev.event_date), " ", ev.event_time && `· ${ev.event_time.slice(0, 5)}`), /*#__PURE__*/React.createElement("h3", {
    className: "font-headline text-xl font-bold text-site-text mb-1"
  }, ev.title), /*#__PURE__*/React.createElement("p", {
    className: "text-sm text-site-muted mb-2"
  }, ev.producer_name, " \xB7 ", ev.city), /*#__PURE__*/React.createElement("p", {
    className: "text-sm text-accent font-semibold"
  }, ev.price > 0 ? `₪${ev.price}` : "חינם"))))));
}
function formatEventDate(iso) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("he-IL", {
      day: "numeric",
      month: "long"
    });
  } catch {
    return iso;
  }
}
Object.assign(__ds_scope, { HomePage });
})(); } catch (e) { __ds_ns.__errors.push({ path: "source/page.js", error: String((e && e.message) || e) }); }

// source/tailwind.config.js
try { (() => {
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx}", "./components/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        primary: "#2e6853",
        // ירוק כהה — כפתורים, לוגו
        "primary-light": "#3a7d64",
        "primary-dark": "#2E4A2E",
        // hero overlays, footer
        secondary: "#4cb08b",
        // ירוק בינוני — הדגשות
        "secondary-light": "#6dc4a3",
        background: "#F5F0E8",
        // קרם חם — לא לבן
        accent: "#8B6914",
        // זהב חם — מחירים, הדגשות
        "accent-warm": "#E8823A",
        "accent-warm-light": "#f0a060",
        light: "#EAF3DE",
        // ירוק בהיר — badges
        "site-text": "#1C1A17",
        // שחור חם — לא pure black
        "site-muted": "#5c584f",
        // warm muted gray — body copy de-emphasis
        "text-primary": "#1C1A17",
        "text-secondary": "#6B6B6B",
        border: "#e8e0d0" // גבול חם
      },
      borderRadius: {
        DEFAULT: "16px"
      },
      fontFamily: {
        heebo: ["Heebo", "sans-serif"],
        headline: ['"Frank Ruhl Libre"', "serif"],
        english: ['"Cormorant Garamond"', "serif"],
        body: ['"DM Sans"', '"Heebo"', "sans-serif"],
        // Backwards-compat aliases for older classes still in the tree
        serif: ['"Frank Ruhl Libre"', "serif"],
        sans: ['"DM Sans"', '"Heebo"', "sans-serif"]
      }
    }
  },
  plugins: []
};
})(); } catch (e) { __ds_ns.__errors.push({ path: "source/tailwind.config.js", error: String((e && e.message) || e) }); }

// ui_kits/mobile/ios-frame.jsx
try { (() => {
// iOS.jsx — Simplified iOS 26 (Liquid Glass) device frame
// Based on the iOS 26 UI Kit + Figma status bar spec. No assets, no deps.
// Exports: IOSDevice, IOSStatusBar, IOSNavBar, IOSGlassPill, IOSList, IOSListRow, IOSKeyboard

// ─────────────────────────────────────────────────────────────
// Status bar
// ─────────────────────────────────────────────────────────────
function IOSStatusBar({
  dark = false,
  time = '9:41'
}) {
  const c = dark ? '#fff' : '#000';
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 154,
      alignItems: 'center',
      justifyContent: 'center',
      padding: '21px 24px 19px',
      boxSizing: 'border-box',
      position: 'relative',
      zIndex: 20,
      width: '100%'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      height: 22,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      paddingTop: 1.5
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: '-apple-system, "SF Pro", system-ui',
      fontWeight: 590,
      fontSize: 17,
      lineHeight: '22px',
      color: c
    }
  }, time)), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      height: 22,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 7,
      paddingTop: 1,
      paddingRight: 1
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "19",
    height: "12",
    viewBox: "0 0 19 12"
  }, /*#__PURE__*/React.createElement("rect", {
    x: "0",
    y: "7.5",
    width: "3.2",
    height: "4.5",
    rx: "0.7",
    fill: c
  }), /*#__PURE__*/React.createElement("rect", {
    x: "4.8",
    y: "5",
    width: "3.2",
    height: "7",
    rx: "0.7",
    fill: c
  }), /*#__PURE__*/React.createElement("rect", {
    x: "9.6",
    y: "2.5",
    width: "3.2",
    height: "9.5",
    rx: "0.7",
    fill: c
  }), /*#__PURE__*/React.createElement("rect", {
    x: "14.4",
    y: "0",
    width: "3.2",
    height: "12",
    rx: "0.7",
    fill: c
  })), /*#__PURE__*/React.createElement("svg", {
    width: "17",
    height: "12",
    viewBox: "0 0 17 12"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M8.5 3.2C10.8 3.2 12.9 4.1 14.4 5.6L15.5 4.5C13.7 2.7 11.2 1.5 8.5 1.5C5.8 1.5 3.3 2.7 1.5 4.5L2.6 5.6C4.1 4.1 6.2 3.2 8.5 3.2Z",
    fill: c
  }), /*#__PURE__*/React.createElement("path", {
    d: "M8.5 6.8C9.9 6.8 11.1 7.3 12 8.2L13.1 7.1C11.8 5.9 10.2 5.1 8.5 5.1C6.8 5.1 5.2 5.9 3.9 7.1L5 8.2C5.9 7.3 7.1 6.8 8.5 6.8Z",
    fill: c
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "8.5",
    cy: "10.5",
    r: "1.5",
    fill: c
  })), /*#__PURE__*/React.createElement("svg", {
    width: "27",
    height: "13",
    viewBox: "0 0 27 13"
  }, /*#__PURE__*/React.createElement("rect", {
    x: "0.5",
    y: "0.5",
    width: "23",
    height: "12",
    rx: "3.5",
    stroke: c,
    strokeOpacity: "0.35",
    fill: "none"
  }), /*#__PURE__*/React.createElement("rect", {
    x: "2",
    y: "2",
    width: "20",
    height: "9",
    rx: "2",
    fill: c
  }), /*#__PURE__*/React.createElement("path", {
    d: "M25 4.5V8.5C25.8 8.2 26.5 7.2 26.5 6.5C26.5 5.8 25.8 4.8 25 4.5Z",
    fill: c,
    fillOpacity: "0.4"
  }))));
}

// ─────────────────────────────────────────────────────────────
// Liquid glass pill — blur + tint + shine
// ─────────────────────────────────────────────────────────────
function IOSGlassPill({
  children,
  dark = false,
  style = {}
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      height: 44,
      minWidth: 44,
      borderRadius: 9999,
      position: 'relative',
      overflow: 'hidden',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      boxShadow: dark ? '0 2px 6px rgba(0,0,0,0.35), 0 6px 16px rgba(0,0,0,0.2)' : '0 1px 3px rgba(0,0,0,0.07), 0 3px 10px rgba(0,0,0,0.06)',
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      borderRadius: 9999,
      backdropFilter: 'blur(12px) saturate(180%)',
      WebkitBackdropFilter: 'blur(12px) saturate(180%)',
      background: dark ? 'rgba(120,120,128,0.28)' : 'rgba(255,255,255,0.5)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      borderRadius: 9999,
      boxShadow: dark ? 'inset 1.5px 1.5px 1px rgba(255,255,255,0.15), inset -1px -1px 1px rgba(255,255,255,0.08)' : 'inset 1.5px 1.5px 1px rgba(255,255,255,0.7), inset -1px -1px 1px rgba(255,255,255,0.4)',
      border: dark ? '0.5px solid rgba(255,255,255,0.15)' : '0.5px solid rgba(0,0,0,0.06)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      zIndex: 1,
      display: 'flex',
      alignItems: 'center',
      padding: '0 4px'
    }
  }, children));
}

// ─────────────────────────────────────────────────────────────
// Navigation bar — glass pills + large title
// ─────────────────────────────────────────────────────────────
function IOSNavBar({
  title = 'Title',
  dark = false,
  trailingIcon = true
}) {
  const muted = dark ? 'rgba(255,255,255,0.6)' : '#404040';
  const text = dark ? '#fff' : '#000';
  const pillIcon = content => /*#__PURE__*/React.createElement(IOSGlassPill, {
    dark: dark
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 36,
      height: 36,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, content));
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
      paddingTop: 62,
      paddingBottom: 10,
      position: 'relative',
      zIndex: 5
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 16px'
    }
  }, pillIcon(/*#__PURE__*/React.createElement("svg", {
    width: "12",
    height: "20",
    viewBox: "0 0 12 20",
    fill: "none",
    style: {
      marginLeft: -1
    }
  }, /*#__PURE__*/React.createElement("path", {
    d: "M10 2L2 10l8 8",
    stroke: muted,
    strokeWidth: "2.5",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }))), trailingIcon && pillIcon(/*#__PURE__*/React.createElement("svg", {
    width: "22",
    height: "6",
    viewBox: "0 0 22 6"
  }, /*#__PURE__*/React.createElement("circle", {
    cx: "3",
    cy: "3",
    r: "2.5",
    fill: muted
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "11",
    cy: "3",
    r: "2.5",
    fill: muted
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "19",
    cy: "3",
    r: "2.5",
    fill: muted
  })))), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '0 16px',
      fontFamily: '-apple-system, system-ui',
      fontSize: 34,
      fontWeight: 700,
      lineHeight: '41px',
      color: text,
      letterSpacing: 0.4
    }
  }, title));
}

// ─────────────────────────────────────────────────────────────
// Grouped list (inset card, r:26) + row (52px)
// ─────────────────────────────────────────────────────────────
function IOSListRow({
  title,
  detail,
  icon,
  chevron = true,
  isLast = false,
  dark = false
}) {
  const text = dark ? '#fff' : '#000';
  const sec = dark ? 'rgba(235,235,245,0.6)' : 'rgba(60,60,67,0.6)';
  const ter = dark ? 'rgba(235,235,245,0.3)' : 'rgba(60,60,67,0.3)';
  const sep = dark ? 'rgba(84,84,88,0.65)' : 'rgba(60,60,67,0.12)';
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      minHeight: 52,
      padding: '0 16px',
      position: 'relative',
      fontFamily: '-apple-system, system-ui',
      fontSize: 17,
      letterSpacing: -0.43
    }
  }, icon && /*#__PURE__*/React.createElement("div", {
    style: {
      width: 30,
      height: 30,
      borderRadius: 7,
      background: icon,
      marginRight: 12,
      flexShrink: 0
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      color: text
    }
  }, title), detail && /*#__PURE__*/React.createElement("span", {
    style: {
      color: sec,
      marginRight: 6
    }
  }, detail), chevron && /*#__PURE__*/React.createElement("svg", {
    width: "8",
    height: "14",
    viewBox: "0 0 8 14",
    style: {
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement("path", {
    d: "M1 1l6 6-6 6",
    stroke: ter,
    strokeWidth: "2",
    fill: "none",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  })), !isLast && /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      bottom: 0,
      right: 0,
      left: icon ? 58 : 16,
      height: 0.5,
      background: sep
    }
  }));
}
function IOSList({
  header,
  children,
  dark = false
}) {
  const hc = dark ? 'rgba(235,235,245,0.6)' : 'rgba(60,60,67,0.6)';
  const bg = dark ? '#1C1C1E' : '#fff';
  return /*#__PURE__*/React.createElement("div", null, header && /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: '-apple-system, system-ui',
      fontSize: 13,
      color: hc,
      textTransform: 'uppercase',
      padding: '8px 36px 6px',
      letterSpacing: -0.08
    }
  }, header), /*#__PURE__*/React.createElement("div", {
    style: {
      background: bg,
      borderRadius: 26,
      margin: '0 16px',
      overflow: 'hidden'
    }
  }, children));
}

// ─────────────────────────────────────────────────────────────
// Device frame
// ─────────────────────────────────────────────────────────────
function IOSDevice({
  children,
  width = 402,
  height = 874,
  dark = false,
  title,
  keyboard = false
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      width,
      height,
      borderRadius: 48,
      overflow: 'hidden',
      position: 'relative',
      background: dark ? '#000' : '#F2F2F7',
      boxShadow: '0 40px 80px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.12)',
      fontFamily: '-apple-system, system-ui, sans-serif',
      WebkitFontSmoothing: 'antialiased'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: 11,
      left: '50%',
      transform: 'translateX(-50%)',
      width: 126,
      height: 37,
      borderRadius: 24,
      background: '#000',
      zIndex: 50
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 10
    }
  }, /*#__PURE__*/React.createElement(IOSStatusBar, {
    dark: dark
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      height: '100%',
      display: 'flex',
      flexDirection: 'column'
    }
  }, title !== undefined && /*#__PURE__*/React.createElement(IOSNavBar, {
    title: title,
    dark: dark
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      overflow: 'auto'
    }
  }, children), keyboard && /*#__PURE__*/React.createElement(IOSKeyboard, {
    dark: dark
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      zIndex: 60,
      height: 34,
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'flex-end',
      paddingBottom: 8,
      pointerEvents: 'none'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 139,
      height: 5,
      borderRadius: 100,
      background: dark ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.25)'
    }
  })));
}

// ─────────────────────────────────────────────────────────────
// Keyboard — iOS 26 liquid glass
// ─────────────────────────────────────────────────────────────
function IOSKeyboard({
  dark = false
}) {
  const glyph = dark ? 'rgba(255,255,255,0.7)' : '#595959';
  const sugg = dark ? 'rgba(255,255,255,0.6)' : '#333';
  const keyBg = dark ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.85)';

  // special-key icons
  const icons = {
    shift: /*#__PURE__*/React.createElement("svg", {
      width: "19",
      height: "17",
      viewBox: "0 0 19 17"
    }, /*#__PURE__*/React.createElement("path", {
      d: "M9.5 1L1 9.5h4.5V16h8V9.5H18L9.5 1z",
      fill: glyph
    })),
    del: /*#__PURE__*/React.createElement("svg", {
      width: "23",
      height: "17",
      viewBox: "0 0 23 17"
    }, /*#__PURE__*/React.createElement("path", {
      d: "M7 1h13a2 2 0 012 2v11a2 2 0 01-2 2H7l-6-7.5L7 1z",
      fill: "none",
      stroke: glyph,
      strokeWidth: "1.6",
      strokeLinejoin: "round"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M10 5l7 7M17 5l-7 7",
      stroke: glyph,
      strokeWidth: "1.6",
      strokeLinecap: "round"
    })),
    ret: /*#__PURE__*/React.createElement("svg", {
      width: "20",
      height: "14",
      viewBox: "0 0 20 14"
    }, /*#__PURE__*/React.createElement("path", {
      d: "M18 1v6H4m0 0l4-4M4 7l4 4",
      fill: "none",
      stroke: "#fff",
      strokeWidth: "1.8",
      strokeLinecap: "round",
      strokeLinejoin: "round"
    }))
  };
  const key = (content, {
    w,
    flex,
    ret,
    fs = 25,
    k
  } = {}) => /*#__PURE__*/React.createElement("div", {
    key: k,
    style: {
      height: 42,
      borderRadius: 8.5,
      flex: flex ? 1 : undefined,
      width: w,
      minWidth: 0,
      background: ret ? '#08f' : keyBg,
      boxShadow: '0 1px 0 rgba(0,0,0,0.075)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: '-apple-system, "SF Compact", system-ui',
      fontSize: fs,
      fontWeight: 458,
      color: ret ? '#fff' : glyph
    }
  }, content);
  const row = (keys, pad = 0) => /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 6.5,
      justifyContent: 'center',
      padding: `0 ${pad}px`
    }
  }, keys.map(l => key(l, {
    flex: true,
    k: l
  })));
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      zIndex: 15,
      borderRadius: 27,
      overflow: 'hidden',
      padding: '11px 0 2px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      boxShadow: dark ? '0 -2px 20px rgba(0,0,0,0.09)' : '0 -1px 6px rgba(0,0,0,0.018), 0 -3px 20px rgba(0,0,0,0.012)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      borderRadius: 27,
      backdropFilter: 'blur(12px) saturate(180%)',
      WebkitBackdropFilter: 'blur(12px) saturate(180%)',
      background: dark ? 'rgba(120,120,128,0.14)' : 'rgba(255,255,255,0.25)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      borderRadius: 27,
      boxShadow: dark ? 'inset 1.5px 1.5px 1px rgba(255,255,255,0.15)' : 'inset 1.5px 1.5px 1px rgba(255,255,255,0.7), inset -1px -1px 1px rgba(255,255,255,0.4)',
      border: dark ? '0.5px solid rgba(255,255,255,0.15)' : '0.5px solid rgba(0,0,0,0.06)',
      pointerEvents: 'none'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 20,
      alignItems: 'center',
      padding: '8px 22px 13px',
      width: '100%',
      boxSizing: 'border-box',
      position: 'relative'
    }
  }, ['"The"', 'the', 'to'].map((w, i) => /*#__PURE__*/React.createElement(React.Fragment, {
    key: i
  }, i > 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      width: 1,
      height: 25,
      background: '#ccc',
      opacity: 0.3
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      textAlign: 'center',
      fontFamily: '-apple-system, system-ui',
      fontSize: 17,
      color: sugg,
      letterSpacing: -0.43,
      lineHeight: '22px'
    }
  }, w)))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 13,
      padding: '0 6.5px',
      width: '100%',
      boxSizing: 'border-box',
      position: 'relative'
    }
  }, row(['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p']), row(['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'], 20), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 14.25,
      alignItems: 'center'
    }
  }, key(icons.shift, {
    w: 45,
    k: 'shift'
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 6.5,
      flex: 1
    }
  }, ['z', 'x', 'c', 'v', 'b', 'n', 'm'].map(l => key(l, {
    flex: true,
    k: l
  }))), key(icons.del, {
    w: 45,
    k: 'del'
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 6,
      alignItems: 'center'
    }
  }, key('ABC', {
    w: 92.25,
    fs: 18,
    k: 'abc'
  }), key('', {
    flex: true,
    k: 'space'
  }), key(icons.ret, {
    w: 92.25,
    ret: true,
    k: 'ret'
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      height: 56,
      width: '100%',
      position: 'relative'
    }
  }));
}
Object.assign(window, {
  IOSDevice,
  IOSStatusBar,
  IOSNavBar,
  IOSGlassPill,
  IOSList,
  IOSListRow,
  IOSKeyboard
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/mobile/ios-frame.jsx", error: String((e && e.message) || e) }); }

// ui_kits/mobile/m-icons.jsx
try { (() => {
// Mobile app icons — tabbar + utility. Inline SVG, stroke/fill via props.
const {
  createElement: mh
} = React;
const MIconHouse = ({
  size = 24,
  stroke = 'currentColor',
  fill = 'none'
}) => /*#__PURE__*/React.createElement("svg", {
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: fill,
  stroke: stroke,
  strokeWidth: "1.8",
  strokeLinecap: "round",
  strokeLinejoin: "round"
}, /*#__PURE__*/React.createElement("path", {
  d: "M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1h-5v-7h-6v7H4a1 1 0 01-1-1V9.5z"
}));
const MIconMap = ({
  size = 24,
  stroke = 'currentColor',
  fill = 'none'
}) => /*#__PURE__*/React.createElement("svg", {
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: fill,
  stroke: stroke,
  strokeWidth: "1.8",
  strokeLinecap: "round",
  strokeLinejoin: "round"
}, /*#__PURE__*/React.createElement("path", {
  d: "M1 6v16l7-3 8 3 7-3V3l-7 3-8-3-7 3z"
}), /*#__PURE__*/React.createElement("path", {
  d: "M8 3v16M16 6v16"
}));
const MIconPot = ({
  size = 24,
  stroke = 'currentColor',
  fill = 'none'
}) => /*#__PURE__*/React.createElement("svg", {
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: fill,
  stroke: stroke,
  strokeWidth: "1.8",
  strokeLinecap: "round",
  strokeLinejoin: "round"
}, /*#__PURE__*/React.createElement("path", {
  d: "M3 10h18v4a6 6 0 01-6 6H9a6 6 0 01-6-6v-4z"
}), /*#__PURE__*/React.createElement("path", {
  d: "M5 10V8h14v2"
}), /*#__PURE__*/React.createElement("path", {
  d: "M10 4c0-1 .5-2 2-2s2 1 2 2"
}));
const MIconHeart = ({
  size = 24,
  stroke = 'currentColor',
  fill = 'none'
}) => /*#__PURE__*/React.createElement("svg", {
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: fill,
  stroke: stroke,
  strokeWidth: "1.8",
  strokeLinecap: "round",
  strokeLinejoin: "round"
}, /*#__PURE__*/React.createElement("path", {
  d: "M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 000-7.78z"
}));
const MIconUser = ({
  size = 24,
  stroke = 'currentColor',
  fill = 'none'
}) => /*#__PURE__*/React.createElement("svg", {
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: fill,
  stroke: stroke,
  strokeWidth: "1.8",
  strokeLinecap: "round",
  strokeLinejoin: "round"
}, /*#__PURE__*/React.createElement("circle", {
  cx: "12",
  cy: "8",
  r: "4"
}), /*#__PURE__*/React.createElement("path", {
  d: "M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"
}));
const MIconSearch = ({
  size = 20,
  stroke = 'currentColor'
}) => /*#__PURE__*/React.createElement("svg", {
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: stroke,
  strokeWidth: "2",
  strokeLinecap: "round"
}, /*#__PURE__*/React.createElement("circle", {
  cx: "11",
  cy: "11",
  r: "7"
}), /*#__PURE__*/React.createElement("path", {
  d: "m21 21-4.35-4.35"
}));
const MIconChevL = ({
  size = 20,
  stroke = 'currentColor'
}) =>
/*#__PURE__*/
/* RTL back = arrow pointing right */
React.createElement("svg", {
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: stroke,
  strokeWidth: "2.2",
  strokeLinecap: "round",
  strokeLinejoin: "round"
}, /*#__PURE__*/React.createElement("path", {
  d: "M9 6l6 6-6 6"
}));
const MIconCrosshair = ({
  size = 20,
  stroke = 'currentColor'
}) => /*#__PURE__*/React.createElement("svg", {
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: stroke,
  strokeWidth: "2",
  strokeLinecap: "round",
  strokeLinejoin: "round"
}, /*#__PURE__*/React.createElement("circle", {
  cx: "12",
  cy: "12",
  r: "9"
}), /*#__PURE__*/React.createElement("circle", {
  cx: "12",
  cy: "12",
  r: "3"
}), /*#__PURE__*/React.createElement("path", {
  d: "M12 2v4M12 18v4M2 12h4M18 12h4"
}));
const MIconPin = ({
  size = 20,
  fill = 'currentColor'
}) => /*#__PURE__*/React.createElement("svg", {
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: fill
}, /*#__PURE__*/React.createElement("path", {
  d: "M12 2C7.6 2 4 5.6 4 10c0 6 8 12 8 12s8-6 8-12c0-4.4-3.6-8-8-8zm0 11a3 3 0 110-6 3 3 0 010 6z"
}));
const MIconWhatsApp = ({
  size = 22,
  fill = 'currentColor'
}) => /*#__PURE__*/React.createElement("svg", {
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: fill
}, /*#__PURE__*/React.createElement("path", {
  d: "M20.52 3.48A11.9 11.9 0 0012.04 0C5.45 0 .1 5.35.1 11.94c0 2.1.55 4.15 1.6 5.96L0 24l6.27-1.64a11.9 11.9 0 005.77 1.47h.01c6.59 0 11.94-5.35 11.94-11.94 0-3.19-1.24-6.19-3.47-8.41zM17.47 14.4c-.3-.15-1.76-.86-2.03-.96-.27-.1-.47-.15-.67.15s-.77.96-.94 1.16c-.17.2-.35.22-.65.08-.3-.15-1.25-.46-2.38-1.47-.88-.78-1.47-1.75-1.65-2.04-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.07-.15-.67-1.61-.92-2.2-.24-.58-.49-.5-.67-.51l-.57-.01c-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.48 0 1.46 1.07 2.88 1.22 3.08.15.2 2.1 3.2 5.08 4.49.71.3 1.26.49 1.69.63.71.22 1.36.19 1.87.12.57-.09 1.76-.72 2-1.41.25-.7.25-1.29.17-1.41-.07-.12-.27-.2-.57-.34z"
}));
const MIconPhone = ({
  size = 20,
  stroke = 'currentColor'
}) => /*#__PURE__*/React.createElement("svg", {
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: stroke,
  strokeWidth: "2",
  strokeLinecap: "round",
  strokeLinejoin: "round"
}, /*#__PURE__*/React.createElement("path", {
  d: "M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.1.97.34 1.92.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.89.36 1.84.6 2.81.7A2 2 0 0122 16.92z"
}));
const MIconIG = ({
  size = 20,
  stroke = 'currentColor'
}) => /*#__PURE__*/React.createElement("svg", {
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: stroke,
  strokeWidth: "2",
  strokeLinecap: "round",
  strokeLinejoin: "round"
}, /*#__PURE__*/React.createElement("rect", {
  x: "2",
  y: "2",
  width: "20",
  height: "20",
  rx: "5"
}), /*#__PURE__*/React.createElement("path", {
  d: "M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"
}), /*#__PURE__*/React.createElement("line", {
  x1: "17.5",
  y1: "6.5",
  x2: "17.51",
  y2: "6.5"
}));
const MIconSeal = ({
  size = 13,
  fill = 'currentColor'
}) => /*#__PURE__*/React.createElement("svg", {
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: fill
}, /*#__PURE__*/React.createElement("path", {
  d: "M12 2l2.5 2.2 3.3-.6.7 3.3L21 9l-1.5 3L21 15l-2.5 2.1-.7 3.3-3.3-.6L12 22l-2.5-2.2-3.3.6-.7-3.3L3 15l1.5-3L3 9l2.5-2.1.7-3.3 3.3.6L12 2zm-1 13l6-6-1.4-1.4L11 12.2l-2.6-2.6L7 11l4 4z"
}));
Object.assign(window, {
  MIconHouse,
  MIconMap,
  MIconPot,
  MIconHeart,
  MIconUser,
  MIconSearch,
  MIconChevL,
  MIconCrosshair,
  MIconPin,
  MIconWhatsApp,
  MIconPhone,
  MIconIG,
  MIconSeal
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/mobile/m-icons.jsx", error: String((e && e.message) || e) }); }

// ui_kits/mobile/screens.jsx
try { (() => {
// Mobile screens — Discover, Map, ProducerDetail, About, Search
// All RTL. Uses global tokens from colors_and_type.css. Icons from m-icons.jsx.

// ────────────────────────────────────────────────────────────
// Shared chrome
// ────────────────────────────────────────────────────────────
function AppStatusBar({
  color = 'var(--fg)'
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      height: 44,
      display: 'flex',
      alignItems: 'flex-end',
      justifyContent: 'space-between',
      padding: '0 24px 8px',
      fontFamily: '-apple-system, system-ui',
      fontSize: 15,
      fontWeight: 600,
      color
    }
  }, /*#__PURE__*/React.createElement("span", null, "9:41"), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      gap: 6,
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "18",
    height: "10",
    viewBox: "0 0 18 10"
  }, /*#__PURE__*/React.createElement("rect", {
    x: "0",
    y: "6",
    width: "3",
    height: "4",
    rx: "0.6",
    fill: "currentColor"
  }), /*#__PURE__*/React.createElement("rect", {
    x: "4",
    y: "4",
    width: "3",
    height: "6",
    rx: "0.6",
    fill: "currentColor"
  }), /*#__PURE__*/React.createElement("rect", {
    x: "8",
    y: "2",
    width: "3",
    height: "8",
    rx: "0.6",
    fill: "currentColor"
  }), /*#__PURE__*/React.createElement("rect", {
    x: "12",
    y: "0",
    width: "3",
    height: "10",
    rx: "0.6",
    fill: "currentColor"
  })), /*#__PURE__*/React.createElement("svg", {
    width: "24",
    height: "11",
    viewBox: "0 0 24 11"
  }, /*#__PURE__*/React.createElement("rect", {
    x: "0.5",
    y: "0.5",
    width: "20",
    height: "10",
    rx: "2.5",
    stroke: "currentColor",
    strokeOpacity: "0.4",
    fill: "none"
  }), /*#__PURE__*/React.createElement("rect", {
    x: "2",
    y: "2",
    width: "15",
    height: "7",
    rx: "1.5",
    fill: "currentColor"
  }))));
}
function MobileTabBar({
  current = 'discover',
  onNav
}) {
  const tabs = [{
    k: 'discover',
    l: 'גלי',
    Icon: MIconHouse
  }, {
    k: 'map',
    l: 'מפה',
    Icon: MIconMap
  }, {
    k: 'neighbor',
    l: 'מהשכן',
    Icon: MIconPot
  }, {
    k: 'favorites',
    l: 'שמורים',
    Icon: MIconHeart
  }, {
    k: 'profile',
    l: 'פרופיל',
    Icon: MIconUser
  }];
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      bottom: 0,
      insetInline: 0,
      background: 'rgba(255,255,255,0.98)',
      borderTop: '1px solid var(--border)',
      paddingBottom: 24,
      boxShadow: '0 -1px 4px rgba(0,0,0,0.04)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(5, 1fr)'
    }
  }, tabs.map(t => {
    const active = t.k === current;
    return /*#__PURE__*/React.createElement("button", {
      key: t.k,
      onClick: () => onNav?.(t.k),
      style: {
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 3,
        padding: '8px 4px 6px',
        color: active ? 'var(--primary)' : 'var(--fg-muted)'
      }
    }, /*#__PURE__*/React.createElement(t.Icon, {
      size: 22,
      stroke: active ? 'var(--primary)' : 'currentColor',
      fill: active ? 'var(--primary)' : 'none'
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 10.5,
        fontFamily: 'var(--font-body)',
        fontWeight: active ? 600 : 500
      }
    }, t.l));
  })));
}

// ────────────────────────────────────────────────────────────
// DISCOVER
// ────────────────────────────────────────────────────────────
function DiscoverScreen({
  onGo
}) {
  const quick = [{
    k: 'veg',
    l: 'ירקות',
    img: 'https://images.unsplash.com/photo-1540420773420-3366772f4999?w=300&q=80'
  }, {
    k: 'bread',
    l: 'לחמים',
    img: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=300&q=80'
  }, {
    k: 'dairy',
    l: 'חלב',
    img: 'https://images.unsplash.com/photo-1486297678162-eb2a19b0a32d?w=300&q=80'
  }, {
    k: 'oil',
    l: 'שמנים',
    img: 'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=300&q=80'
  }];
  const producers = (window.SAMPLE_PRODUCERS || []).slice(0, 3);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      height: '100%',
      overflowY: 'auto',
      background: 'var(--background)',
      paddingBottom: 96
    }
  }, /*#__PURE__*/React.createElement(AppStatusBar, null), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '8px 20px 16px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 12
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: "../../assets/logo.png",
    alt: "\u05DE\u05D4\u05DE\u05E7\u05D5\u05E8",
    style: {
      height: 28
    }
  }), /*#__PURE__*/React.createElement("button", {
    style: {
      background: 'var(--light)',
      border: 'none',
      width: 40,
      height: 40,
      borderRadius: 9999,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'var(--primary)'
    }
  }, /*#__PURE__*/React.createElement(MIconHeart, {
    size: 20,
    stroke: "var(--primary)"
  }))), /*#__PURE__*/React.createElement("h1", {
    style: {
      fontFamily: 'var(--font-headline)',
      fontWeight: 700,
      fontSize: 32,
      lineHeight: 1.1,
      margin: '4px 0 2px',
      color: 'var(--fg)'
    }
  }, "\u05E9\u05DC\u05D5\u05DD, \u05E9\u05E8\u05D5\u05E0\u05D4 \uD83D\uDC4B"), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 14,
      color: 'var(--fg-muted)',
      margin: 0
    }
  }, "\u05DE\u05E6\u05D0\u05D9 \u05D0\u05EA \u05D1\u05D9\u05EA \u05D4\u05E2\u05E1\u05E7 \u05D4\u05D1\u05D0 \u05E9\u05DC\u05DA")), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '0 20px 16px'
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => onGo?.('search'),
    style: {
      width: '100%',
      background: '#fff',
      border: '1px solid var(--border)',
      borderRadius: 9999,
      padding: '14px 18px',
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      color: 'var(--fg-muted)',
      fontSize: 15,
      fontFamily: 'var(--font-body)',
      cursor: 'pointer',
      textAlign: 'start'
    }
  }, /*#__PURE__*/React.createElement(MIconSearch, {
    stroke: "var(--primary)"
  }), "\u05D7\u05E4\u05E9\u05D9 \u05D1\u05D9\u05EA \u05E2\u05E1\u05E7, \u05E2\u05D9\u05E8 \u05D0\u05D5 \u05E7\u05D8\u05D2\u05D5\u05E8\u05D9\u05D4")), /*#__PURE__*/React.createElement("div", {
    style: {
      margin: '0 20px 24px',
      padding: '20px',
      borderRadius: 20,
      background: 'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)',
      color: '#fff',
      position: 'relative',
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("svg", {
    style: {
      position: 'absolute',
      insetInlineStart: -20,
      bottom: -20,
      color: 'rgba(255,255,255,0.08)'
    },
    width: "140",
    height: "140",
    viewBox: "0 0 64 64",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.2"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M32 52 L32 20"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M32 20 C32 20 18 16 14 28 C18 28 26 26 32 32"
  })), /*#__PURE__*/React.createElement("div", {
    className: "eyebrow",
    style: {
      color: 'rgba(255,255,255,0.75)',
      fontSize: 10,
      marginBottom: 6
    }
  }, "NEAR YOU \xB7 \u05D1\u05D0\u05D6\u05D5\u05E8 \u05E9\u05DC\u05DA"), /*#__PURE__*/React.createElement("h2", {
    style: {
      fontFamily: 'var(--font-headline)',
      fontWeight: 700,
      fontSize: 22,
      margin: '0 0 4px',
      lineHeight: 1.2
    }
  }, "14 \u05E2\u05E1\u05E7\u05D9\u05DD \u05DE\u05D0\u05D5\u05DE\u05EA\u05D9\u05DD", /*#__PURE__*/React.createElement("br", null), "\u05D1\u05D8\u05D5\u05D5\u05D7 \u05E9\u05DC 5 \u05E7\"\u05DE"), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 13,
      opacity: 0.85,
      margin: '0 0 14px'
    }
  }, "\u05E8\u05DE\u05EA \u05D2\u05DF \xB7 \u05D2\u05D1\u05E2\u05EA\u05D9\u05D9\u05DD \xB7 \u05EA\u05DC \u05D0\u05D1\u05D9\u05D1"), /*#__PURE__*/React.createElement("button", {
    onClick: () => onGo?.('map'),
    style: {
      background: '#fff',
      color: 'var(--primary-dark)',
      border: 'none',
      padding: '10px 18px',
      borderRadius: 9999,
      fontSize: 13,
      fontWeight: 600,
      cursor: 'pointer',
      display: 'inline-flex',
      alignItems: 'center',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement(MIconCrosshair, {
    size: 16,
    stroke: "var(--primary-dark)"
  }), " \u05E4\u05EA\u05D7\u05D9 \u05D1\u05DE\u05E4\u05D4")), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '0 20px 12px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'baseline',
      marginBottom: 12
    }
  }, /*#__PURE__*/React.createElement("h3", {
    style: {
      fontFamily: 'var(--font-headline)',
      fontWeight: 700,
      fontSize: 20,
      margin: 0
    }
  }, "\u05E7\u05D8\u05D2\u05D5\u05E8\u05D9\u05D5\u05EA"), /*#__PURE__*/React.createElement("a", {
    href: "#",
    style: {
      fontSize: 13,
      color: 'var(--primary)',
      textDecoration: 'none'
    }
  }, "\u05D4\u05DB\u05DC \u2190"))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 12,
      padding: '0 20px 24px',
      overflowX: 'auto'
    }
  }, quick.map(c => /*#__PURE__*/React.createElement("button", {
    key: c.k,
    style: {
      flex: '0 0 94px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 8,
      background: 'none',
      border: 'none',
      cursor: 'pointer',
      padding: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 84,
      height: 84,
      borderRadius: 20,
      overflow: 'hidden',
      position: 'relative'
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: c.img,
    alt: c.l,
    style: {
      width: '100%',
      height: '100%',
      objectFit: 'cover'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      background: 'rgba(46,74,46,0.15)'
    }
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      color: 'var(--fg)',
      fontFamily: 'var(--font-body)',
      fontWeight: 500
    }
  }, c.l)))), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '0 20px 20px'
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => onGo?.('detail'),
    style: {
      width: '100%',
      background: '#fff',
      border: '1px solid var(--border)',
      borderRadius: 20,
      overflow: 'hidden',
      cursor: 'pointer',
      padding: 0,
      textAlign: 'start'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      aspectRatio: '16/10',
      background: `url(https://images.unsplash.com/photo-1580837119756-563d608dd119?w=800&q=80) center/cover`
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      top: 12,
      insetInlineEnd: 12,
      background: 'rgba(255,255,255,0.96)',
      color: 'var(--primary)',
      padding: '4px 10px',
      borderRadius: 9999,
      fontSize: 11,
      fontWeight: 600,
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4
    }
  }, /*#__PURE__*/React.createElement(MIconSeal, {
    size: 11,
    fill: "var(--primary)"
  }), " \u05DE\u05D0\u05D5\u05DE\u05EA"), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: 12,
      insetInlineStart: 12,
      fontFamily: 'var(--font-english)',
      fontStyle: 'italic',
      fontWeight: 600,
      color: '#fff',
      fontSize: 13,
      background: 'rgba(0,0,0,0.4)',
      padding: '3px 10px',
      borderRadius: 9999,
      backdropFilter: 'blur(8px)'
    }
  }, "Featured \xB7 \u05D4\u05E9\u05D1\u05D5\u05E2")), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: 16
    }
  }, /*#__PURE__*/React.createElement("h4", {
    style: {
      fontFamily: 'var(--font-headline)',
      fontWeight: 700,
      fontSize: 20,
      margin: '0 0 2px'
    }
  }, "\u05D4\u05D7\u05D5\u05D5\u05D4 \u05E9\u05DC \u05DE\u05E8\u05D9\u05DD"), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 13,
      color: 'var(--fg-muted)',
      margin: '0 0 10px'
    }
  }, "\u05D2\u05DC\u05D9\u05DC \u05E2\u05DC\u05D9\u05D5\u05DF \xB7 \uD83E\uDDC0 \u05D2\u05D1\u05D9\u05E0\u05D5\u05EA \u05E2\u05D9\u05D6\u05D9\u05DD"), /*#__PURE__*/React.createElement("p", {
    style: {
      fontFamily: 'var(--font-headline)',
      fontStyle: 'italic',
      fontSize: 15,
      lineHeight: 1.5,
      color: 'var(--fg)',
      margin: '0 0 12px'
    }
  }, "\"11 \u05E2\u05D9\u05D6\u05D9\u05DD, 4 \u05D6\u05E0\u05D9 \u05D2\u05D1\u05D9\u05E0\u05D4, 0 \u05E4\u05E9\u05E8\u05D5\u05EA.\""), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 6,
      flexWrap: 'wrap'
    }
  }, ['🌿 אורגני', '✡️ מהדרין', '🚚 משלוח'].map(t => /*#__PURE__*/React.createElement("span", {
    key: t,
    style: {
      background: 'var(--light)',
      color: 'var(--primary)',
      padding: '4px 10px',
      borderRadius: 9999,
      fontSize: 12
    }
  }, t)))))), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '0 20px 12px'
    }
  }, /*#__PURE__*/React.createElement("h3", {
    style: {
      fontFamily: 'var(--font-headline)',
      fontWeight: 700,
      fontSize: 20,
      margin: '0 0 12px'
    }
  }, "\u05DE\u05D5\u05DE\u05DC\u05E6\u05D5\u05EA \u05D4\u05E9\u05D1\u05D5\u05E2")), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '0 20px',
      display: 'flex',
      flexDirection: 'column',
      gap: 12
    }
  }, producers.map(p => /*#__PURE__*/React.createElement("button", {
    key: p.id,
    onClick: () => onGo?.('detail'),
    style: {
      display: 'flex',
      gap: 12,
      background: '#fff',
      border: '1px solid var(--border)',
      borderRadius: 16,
      padding: 10,
      cursor: 'pointer',
      textAlign: 'start',
      alignItems: 'stretch'
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: p.img,
    alt: p.name,
    style: {
      width: 72,
      height: 72,
      borderRadius: 12,
      objectFit: 'cover',
      flexShrink: 0
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0,
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 6
    }
  }, /*#__PURE__*/React.createElement("h4", {
    style: {
      fontFamily: 'var(--font-headline)',
      fontWeight: 700,
      fontSize: 16,
      margin: 0
    }
  }, p.name), p.verified && /*#__PURE__*/React.createElement(MIconSeal, {
    size: 12,
    fill: "var(--primary)"
  })), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 12,
      color: 'var(--fg-muted)',
      margin: '2px 0 0'
    }
  }, p.city, " \xB7 ", p.category), p.price && /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-english)',
      fontStyle: 'italic',
      color: 'var(--accent)',
      fontSize: 13,
      marginTop: 4
    }
  }, p.price)), /*#__PURE__*/React.createElement("a", {
    href: "#",
    onClick: e => e.stopPropagation(),
    style: {
      width: 40,
      height: 40,
      borderRadius: 9999,
      background: '#25D366',
      color: '#fff',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      alignSelf: 'center'
    }
  }, /*#__PURE__*/React.createElement(MIconWhatsApp, {
    size: 20,
    fill: "#fff"
  }))))));
}

// ────────────────────────────────────────────────────────────
// MAP
// ────────────────────────────────────────────────────────────
function MapScreen({
  onGo
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      height: '100%',
      background: '#e6ddc7',
      position: 'relative',
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement(AppStatusBar, {
    color: "#1C1A17"
  }), /*#__PURE__*/React.createElement("svg", {
    style: {
      position: 'absolute',
      inset: 0,
      width: '100%',
      height: '100%'
    },
    viewBox: "0 0 400 800",
    preserveAspectRatio: "xMidYMid slice"
  }, /*#__PURE__*/React.createElement("rect", {
    width: "400",
    height: "800",
    fill: "#e6ddc7"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M-20 180 Q 100 120 220 200 T 440 240",
    stroke: "#c9b28a",
    strokeWidth: "2",
    fill: "none"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M-20 420 Q 100 380 230 460 T 440 500",
    stroke: "#c9b28a",
    strokeWidth: "2",
    fill: "none"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M180 -20 Q 240 200 160 400 T 220 820",
    stroke: "#d4c29a",
    strokeWidth: "2",
    fill: "none"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M-20 640 Q 140 620 280 700 T 440 680",
    stroke: "#c9b28a",
    strokeWidth: "1.5",
    fill: "none"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "90",
    cy: "240",
    r: "60",
    fill: "#b8d4a8",
    opacity: "0.4"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "320",
    cy: "540",
    r: "80",
    fill: "#b8d4a8",
    opacity: "0.35"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "280",
    cy: "160",
    r: "40",
    fill: "#b8d4a8",
    opacity: "0.5"
  })), [{
    x: 80,
    y: 200,
    n: 3
  }, {
    x: 220,
    y: 160,
    n: 1
  }, {
    x: 150,
    y: 320,
    n: 5
  }, {
    x: 300,
    y: 440,
    n: 2
  }, {
    x: 90,
    y: 500,
    n: 1
  }, {
    x: 260,
    y: 620,
    n: 4
  }].map((p, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      position: 'absolute',
      left: p.x,
      top: p.y,
      transform: 'translate(-50%, -100%)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      background: 'var(--primary)',
      color: '#fff',
      borderRadius: 18,
      padding: '6px 12px',
      fontSize: 13,
      fontWeight: 700,
      fontFamily: 'var(--font-body)',
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
      position: 'relative'
    }
  }, /*#__PURE__*/React.createElement(MIconPin, {
    size: 14,
    fill: "#fff"
  }), p.n, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      bottom: -6,
      insetInlineStart: '50%',
      transform: 'translateX(-50%)',
      width: 0,
      height: 0,
      borderTop: '7px solid var(--primary)',
      borderInline: '7px solid transparent'
    }
  })))), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: 48,
      insetInline: 16,
      display: 'flex',
      gap: 10,
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => onGo?.('discover'),
    style: {
      width: 44,
      height: 44,
      borderRadius: 9999,
      background: 'rgba(255,255,255,0.96)',
      border: 'none',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
      cursor: 'pointer'
    }
  }, /*#__PURE__*/React.createElement(MIconChevL, {
    stroke: "var(--fg)"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      background: 'rgba(255,255,255,0.96)',
      borderRadius: 9999,
      padding: '12px 18px',
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      boxShadow: '0 2px 8px rgba(0,0,0,0.12)'
    }
  }, /*#__PURE__*/React.createElement(MIconSearch, {
    stroke: "var(--primary)"
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--fg-muted)',
      fontSize: 14,
      fontFamily: 'var(--font-body)'
    }
  }, "\u05D7\u05E4\u05E9\u05D9 \u05D1\u05D0\u05D6\u05D5\u05E8..."))), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: 108,
      insetInline: 0,
      padding: '0 16px',
      display: 'flex',
      gap: 8,
      overflowX: 'auto'
    }
  }, ['🌿 אורגני', '✡️ כשר', '🚚 משלוח', '🧀 גבינות', '🍞 לחמים'].map((l, i) => /*#__PURE__*/React.createElement("span", {
    key: l,
    style: {
      background: i === 0 ? 'var(--primary)' : 'rgba(255,255,255,0.96)',
      color: i === 0 ? '#fff' : 'var(--fg)',
      padding: '7px 14px',
      borderRadius: 9999,
      fontSize: 12,
      fontFamily: 'var(--font-body)',
      fontWeight: 500,
      whiteSpace: 'nowrap',
      boxShadow: '0 2px 6px rgba(0,0,0,0.1)'
    }
  }, l))), /*#__PURE__*/React.createElement("button", {
    style: {
      position: 'absolute',
      bottom: 280,
      insetInlineEnd: 16,
      width: 48,
      height: 48,
      borderRadius: 9999,
      background: '#fff',
      border: 'none',
      boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      cursor: 'pointer'
    }
  }, /*#__PURE__*/React.createElement(MIconCrosshair, {
    stroke: "var(--primary)"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      bottom: 88,
      insetInline: 0,
      background: '#fff',
      borderRadius: '24px 24px 0 0',
      padding: '12px 20px 16px',
      boxShadow: '0 -4px 20px rgba(0,0,0,0.08)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 40,
      height: 4,
      background: 'var(--border)',
      borderRadius: 4,
      margin: '0 auto 14px'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      marginBottom: 10
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: "https://images.unsplash.com/photo-1486297678162-eb2a19b0a32d?w=200&q=80",
    alt: "",
    style: {
      width: 52,
      height: 52,
      borderRadius: 10,
      objectFit: 'cover'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 6
    }
  }, /*#__PURE__*/React.createElement("h4", {
    style: {
      fontFamily: 'var(--font-headline)',
      fontWeight: 700,
      fontSize: 17,
      margin: 0
    }
  }, "\u05D4\u05D7\u05D5\u05D5\u05D4 \u05E9\u05DC \u05DE\u05E8\u05D9\u05DD"), /*#__PURE__*/React.createElement(MIconSeal, {
    size: 12,
    fill: "var(--primary)"
  })), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 12,
      color: 'var(--fg-muted)',
      margin: '2px 0 0'
    }
  }, "2.4 \u05E7\"\u05DE \xB7 \u05D2\u05DC\u05D9\u05DC \u05E2\u05DC\u05D9\u05D5\u05DF")), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-english)',
      fontStyle: 'italic',
      color: 'var(--accent)',
      fontSize: 13
    }
  }, "\u05DE-\u20AA28")), /*#__PURE__*/React.createElement("button", {
    onClick: () => onGo?.('detail'),
    style: {
      width: '100%',
      background: 'var(--primary)',
      color: '#fff',
      border: 'none',
      padding: '12px',
      borderRadius: 12,
      fontSize: 14,
      fontWeight: 600,
      cursor: 'pointer',
      fontFamily: 'var(--font-body)'
    }
  }, "\u05E4\u05EA\u05D7\u05D9 \u05E2\u05DE\u05D5\u05D3 \u05D1\u05D9\u05EA \u05D4\u05E2\u05E1\u05E7")));
}

// ────────────────────────────────────────────────────────────
// PRODUCER DETAIL
// ────────────────────────────────────────────────────────────
function DetailScreen({
  onGo
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      height: '100%',
      overflowY: 'auto',
      background: 'var(--background)',
      paddingBottom: 120
    }
  }, /*#__PURE__*/React.createElement(AppStatusBar, {
    color: "#fff"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      aspectRatio: '4/3',
      margin: '-44px 0 0',
      background: `url(https://images.unsplash.com/photo-1580837119756-563d608dd119?w=1000&q=80) center/cover`
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      background: 'linear-gradient(to bottom, rgba(0,0,0,0.3), rgba(0,0,0,0) 40%)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: 56,
      insetInlineStart: 16,
      insetInlineEnd: 16,
      display: 'flex',
      justifyContent: 'space-between'
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => onGo?.('discover'),
    style: {
      width: 40,
      height: 40,
      borderRadius: 9999,
      background: 'rgba(255,255,255,0.96)',
      border: 'none',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      cursor: 'pointer'
    }
  }, /*#__PURE__*/React.createElement(MIconChevL, {
    stroke: "var(--fg)"
  })), /*#__PURE__*/React.createElement("button", {
    style: {
      width: 40,
      height: 40,
      borderRadius: 9999,
      background: 'rgba(255,255,255,0.96)',
      border: 'none',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      cursor: 'pointer',
      color: 'var(--accent-warm)'
    }
  }, /*#__PURE__*/React.createElement(MIconHeart, {
    size: 20,
    fill: "currentColor",
    stroke: "currentColor"
  })))), /*#__PURE__*/React.createElement("div", {
    style: {
      background: 'var(--background)',
      borderRadius: '24px 24px 0 0',
      margin: '-24px 0 0',
      padding: '20px 20px 24px',
      position: 'relative'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8,
      marginBottom: 10
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      background: 'var(--primary)',
      color: '#fff',
      padding: '4px 10px',
      borderRadius: 9999,
      fontSize: 11,
      fontWeight: 600,
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4
    }
  }, /*#__PURE__*/React.createElement(MIconSeal, {
    size: 11,
    fill: "#fff"
  }), " \u05DE\u05D0\u05D5\u05DE\u05EA"), /*#__PURE__*/React.createElement("span", {
    style: {
      background: 'var(--accent-warm)',
      color: '#fff',
      padding: '4px 10px',
      borderRadius: 9999,
      fontSize: 11,
      fontWeight: 600
    }
  }, "\u05E4\u05E8\u05DE\u05D9\u05D5\u05DD")), /*#__PURE__*/React.createElement("h1", {
    style: {
      fontFamily: 'var(--font-headline)',
      fontWeight: 700,
      fontSize: 28,
      margin: '0 0 4px',
      lineHeight: 1.15
    }
  }, "\u05D4\u05D7\u05D5\u05D5\u05D4 \u05E9\u05DC \u05DE\u05E8\u05D9\u05DD"), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 14,
      color: 'var(--fg-muted)',
      margin: '0 0 16px'
    }
  }, "\u05D2\u05DC\u05D9\u05DC \u05E2\u05DC\u05D9\u05D5\u05DF \xB7 \uD83E\uDDC0 \u05D2\u05D1\u05D9\u05E0\u05D5\u05EA \u05E2\u05D9\u05D6\u05D9\u05DD \xB7 \uD83E\uDD5B \u05D7\u05DC\u05D1 \u05D8\u05E8\u05D9"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 6,
      flexWrap: 'wrap',
      marginBottom: 16
    }
  }, ['🌿 אורגני', '🐐 חלב גולמי', '✡️ מהדרין', '🚚 משלוח'].map(t => /*#__PURE__*/React.createElement("span", {
    key: t,
    style: {
      background: 'var(--light)',
      color: 'var(--primary)',
      padding: '5px 12px',
      borderRadius: 9999,
      fontSize: 12
    }
  }, t))), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: 16,
      background: '#fff',
      borderRadius: 14,
      border: '1px solid var(--border)',
      marginBottom: 20
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-english)',
      fontStyle: 'italic',
      fontSize: 22,
      color: 'var(--accent)',
      marginBottom: 4
    }
  }, "\""), /*#__PURE__*/React.createElement("p", {
    style: {
      fontFamily: 'var(--font-headline)',
      fontStyle: 'italic',
      fontSize: 16,
      lineHeight: 1.5,
      color: 'var(--fg)',
      margin: 0
    }
  }, "11 \u05E2\u05D9\u05D6\u05D9\u05DD, 4 \u05D6\u05E0\u05D9 \u05D2\u05D1\u05D9\u05E0\u05D4, 0 \u05E4\u05E9\u05E8\u05D5\u05EA. \u05D0\u05E0\u05D9 \u05DE\u05DB\u05D9\u05E8\u05D4 \u05DB\u05DC \u05D9\u05DC\u05D3\u05D4 \u05E9\u05D1\u05D0\u05D4 \u05DC\u05E7\u05D7\u05EA \u05D2\u05D1\u05D9\u05E0\u05D5\u05EA \u2014 \u05D5\u05D6\u05D4 \u05DE\u05D4 \u05E9\u05E2\u05D5\u05E9\u05D4 \u05D0\u05EA \u05D4\u05D4\u05D1\u05D3\u05DC."), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 12,
      color: 'var(--fg-muted)',
      margin: '10px 0 0'
    }
  }, "\u2014 \u05DE\u05E8\u05D9\u05DD \u05DC\u05D5\u05D9, \u05DE\u05D9\u05D9\u05E1\u05D3\u05EA")), /*#__PURE__*/React.createElement("h3", {
    style: {
      fontFamily: 'var(--font-headline)',
      fontWeight: 700,
      fontSize: 18,
      margin: '0 0 10px'
    }
  }, "\u05D4\u05DE\u05D5\u05E6\u05E8\u05D9\u05DD"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(2, 1fr)',
      gap: 10,
      marginBottom: 20
    }
  }, [{
    n: 'גבינת עיזים צפתית',
    p: '₪ 42',
    img: 'https://images.unsplash.com/photo-1486297678162-eb2a19b0a32d?w=400&q=80'
  }, {
    n: 'לבנה בשמן זית',
    p: '₪ 36',
    img: 'https://images.unsplash.com/photo-1559561853-08451507cbe7?w=400&q=80'
  }].map(pr => /*#__PURE__*/React.createElement("div", {
    key: pr.n,
    style: {
      background: '#fff',
      border: '1px solid var(--border)',
      borderRadius: 12,
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: pr.img,
    alt: pr.n,
    style: {
      width: '100%',
      aspectRatio: '1/1',
      objectFit: 'cover'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: 10
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      fontFamily: 'var(--font-body)',
      fontWeight: 500,
      color: 'var(--fg)'
    }
  }, pr.n), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-english)',
      fontStyle: 'italic',
      fontSize: 14,
      color: 'var(--accent)'
    }
  }, pr.p))))), /*#__PURE__*/React.createElement("h3", {
    style: {
      fontFamily: 'var(--font-headline)',
      fontWeight: 700,
      fontSize: 18,
      margin: '0 0 10px'
    }
  }, "\u05DE\u05D9\u05E7\u05D5\u05DD"), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      aspectRatio: '16/9',
      background: '#e6ddc7',
      borderRadius: 14,
      overflow: 'hidden',
      marginBottom: 20
    }
  }, /*#__PURE__*/React.createElement("svg", {
    style: {
      width: '100%',
      height: '100%'
    },
    viewBox: "0 0 400 200",
    preserveAspectRatio: "xMidYMid slice"
  }, /*#__PURE__*/React.createElement("rect", {
    width: "400",
    height: "200",
    fill: "#e6ddc7"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M-20 80 Q 100 40 220 100 T 440 120",
    stroke: "#c9b28a",
    strokeWidth: "2",
    fill: "none"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "200",
    cy: "100",
    r: "50",
    fill: "#b8d4a8",
    opacity: "0.4"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      insetInlineStart: '50%',
      top: '50%',
      transform: 'translate(-50%, -100%)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      background: 'var(--primary)',
      color: '#fff',
      borderRadius: 9999,
      width: 40,
      height: 40,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
    }
  }, /*#__PURE__*/React.createElement(MIconPin, {
    size: 18,
    fill: "#fff"
  }))))), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      bottom: 0,
      insetInline: 0,
      background: '#fff',
      padding: '12px 20px 28px',
      borderTop: '1px solid var(--border)',
      display: 'flex',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("button", {
    style: {
      width: 48,
      height: 48,
      borderRadius: 9999,
      background: 'var(--light)',
      color: 'var(--primary)',
      border: 'none',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, /*#__PURE__*/React.createElement(MIconPhone, {
    stroke: "var(--primary)"
  })), /*#__PURE__*/React.createElement("button", {
    style: {
      width: 48,
      height: 48,
      borderRadius: 9999,
      background: 'var(--light)',
      color: 'var(--primary)',
      border: 'none',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, /*#__PURE__*/React.createElement(MIconIG, {
    stroke: "var(--primary)"
  })), /*#__PURE__*/React.createElement("button", {
    style: {
      flex: 1,
      background: '#25D366',
      color: '#fff',
      border: 'none',
      borderRadius: 9999,
      fontSize: 15,
      fontWeight: 600,
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      fontFamily: 'var(--font-body)'
    }
  }, /*#__PURE__*/React.createElement(MIconWhatsApp, {
    size: 20,
    fill: "#fff"
  }), " \u05D3\u05D1\u05E8\u05D9 \u05D1\u05D5\u05D5\u05D0\u05D8\u05E1\u05D0\u05E4")));
}

// ────────────────────────────────────────────────────────────
// ABOUT
// ────────────────────────────────────────────────────────────
function AboutScreen({
  onGo
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      height: '100%',
      overflowY: 'auto',
      background: 'var(--background)',
      paddingBottom: 96
    }
  }, /*#__PURE__*/React.createElement(AppStatusBar, null), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '8px 20px 16px',
      display: 'flex',
      alignItems: 'center',
      gap: 12
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => onGo?.('discover'),
    style: {
      width: 40,
      height: 40,
      borderRadius: 9999,
      background: '#fff',
      border: '1px solid var(--border)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      cursor: 'pointer'
    }
  }, /*#__PURE__*/React.createElement(MIconChevL, null)), /*#__PURE__*/React.createElement("h2", {
    style: {
      fontFamily: 'var(--font-headline)',
      fontWeight: 700,
      fontSize: 20,
      margin: 0
    }
  }, "\u05E2\u05DC\u05D9\u05E0\u05D5")), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '0 20px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "eyebrow",
    style: {
      color: 'var(--accent)',
      marginBottom: 14
    }
  }, "OUR STORY \xB7 \u05D4\u05E1\u05D9\u05E4\u05D5\u05E8 \u05E9\u05DC\u05E0\u05D5"), /*#__PURE__*/React.createElement("h1", {
    style: {
      fontFamily: 'var(--font-headline)',
      fontWeight: 900,
      fontSize: 40,
      lineHeight: 0.95,
      letterSpacing: '-0.02em',
      margin: '0 0 16px'
    }
  }, "\u05D4\u05EA\u05D7\u05DC\u05E0\u05D5", /*#__PURE__*/React.createElement("br", null), /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--primary)'
    }
  }, "\u05D1\u05DE\u05D8\u05D1\u05D7 \u05E9\u05DC \u05E1\u05D1\u05EA\u05D0.")), /*#__PURE__*/React.createElement("p", {
    style: {
      fontFamily: 'var(--font-headline)',
      fontStyle: 'italic',
      fontSize: 19,
      lineHeight: 1.5,
      color: 'var(--fg)',
      margin: '0 0 16px'
    }
  }, "\"\u05D4\u05D9\u05D0 \u05EA\u05DE\u05D9\u05D3 \u05D9\u05D3\u05E2\u05D4 \u05D0\u05D9\u05E4\u05D4 \u05DC\u05DE\u05E6\u05D5\u05D0 \u05D0\u05EA \u05D4\u05D2\u05D1\u05D9\u05E0\u05D4 \u05D4\u05DB\u05D9 \u05D8\u05D5\u05D1\u05D4, \u05D0\u05EA \u05D4\u05DC\u05D7\u05DD \u05E9\u05DC \u05D9\u05D5\u05DD \u05E8\u05D0\u05E9\u05D5\u05DF, \u05D0\u05EA \u05D4\u05E9\u05DE\u05DF \u05DE\u05D4\u05E2\u05D5\u05E0\u05D4 \u05E9\u05E2\u05D1\u05E8\u05D4. \u05D4\u05D8\u05DC\u05E4\u05D5\u05E0\u05D9\u05DD \u05D4\u05D9\u05D5 \u05D1\u05E8\u05D0\u05E9.\""), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 15,
      lineHeight: 1.7,
      color: 'var(--fg-muted)',
      margin: '0 0 28px'
    }
  }, "\u05DE\u05D4\u05DE\u05E7\u05D5\u05E8 \u05D1\u05E0\u05D5\u05D9 \u05E2\u05DC \u05D0\u05D5\u05EA\u05D5 \u05E2\u05D9\u05E7\u05E8\u05D5\u05DF \u2014 \u05D1\u05DC\u05D9 \u05D0\u05E4\u05DC\u05D9\u05E7\u05E6\u05D9\u05D4 \u05DE\u05EA\u05D5\u05D5\u05DB\u05EA, \u05D1\u05DC\u05D9 \u05E2\u05DE\u05DC\u05D5\u05EA \u05DC\u05D2\u05D0\u05DC\u05D9, \u05D1\u05DC\u05D9 \u05DE\u05D5\u05DB\u05E8\u05D9\u05DD \u05D0\u05E0\u05D5\u05E0\u05D9\u05DE\u05D9\u05D9\u05DD. \u05E8\u05E7 \u05E8\u05E9\u05D9\u05DE\u05D4 \u05E7\u05D4\u05D9\u05DC\u05EA\u05D9\u05EA \u05E9\u05DC \u05D1\u05EA\u05D9 \u05E2\u05E1\u05E7 \u05D0\u05DE\u05D9\u05EA\u05D9\u05D9\u05DD, \u05E9\u05DB\u05D5\u05DC\u05DD \u05DE\u05D0\u05D5\u05DE\u05EA\u05D9\u05DD \u05D9\u05D3\u05E0\u05D9\u05EA \u05E2\u05DC \u05D9\u05D3\u05D9 \u05D4\u05E6\u05D5\u05D5\u05EA \u05E9\u05DC\u05E0\u05D5."), /*#__PURE__*/React.createElement("div", {
    style: {
      background: '#fff',
      border: '1px solid var(--border)',
      borderRadius: 20,
      padding: 18,
      marginBottom: 24
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 14,
      marginBottom: 12
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 52,
      height: 52,
      borderRadius: 9999,
      background: 'var(--light)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'var(--font-headline)',
      fontWeight: 700,
      color: 'var(--primary)',
      fontSize: 20
    }
  }, "\u05E1"), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-english)',
      fontStyle: 'italic',
      fontSize: 17,
      fontWeight: 600
    }
  }, "\u05E1\u05E4\u05D9\u05E8 \u05DB\u05D4\u05DF"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: 'var(--fg-muted)'
    }
  }, "\u05DE\u05D9\u05D9\u05E1\u05D3\u05EA \xB7 \u05EA\u05DC \u05D0\u05D1\u05D9\u05D1"))), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 14,
      lineHeight: 1.6,
      color: 'var(--fg)',
      margin: 0
    }
  }, "\"\u05D4\u05EA\u05D7\u05DC\u05EA\u05D9 \u05D0\u05EA \u05DE\u05D4\u05DE\u05E7\u05D5\u05E8 \u05D0\u05D7\u05E8\u05D9 \u05E9\u05D7\u05D9\u05E4\u05E9\u05EA\u05D9 \u05D7\u05DC\u05D1 \u05E2\u05D9\u05D6\u05D9\u05DD \u05DC-3 \u05D7\u05D5\u05D3\u05E9\u05D9\u05DD. \u05E2\u05DB\u05E9\u05D9\u05D5 248 \u05D1\u05EA\u05D9 \u05E2\u05E1\u05E7 \u05D0\u05D9\u05EA\u05E0\u05D5, \u05D5\u05D6\u05D4 \u05E8\u05E7 \u05DE\u05EA\u05D7\u05D9\u05DC.\"")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 10,
      marginBottom: 24
    }
  }, [{
    n: '248',
    l: 'בתי עסק מאומתים'
  }, {
    n: '12',
    l: 'קטגוריות'
  }, {
    n: '36',
    l: 'ערים בכיסוי'
  }, {
    n: '0',
    l: 'עמלות. לתמיד.'
  }].map(s => /*#__PURE__*/React.createElement("div", {
    key: s.l,
    style: {
      padding: 14,
      background: '#fff',
      border: '1px solid var(--border)',
      borderRadius: 14
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-english)',
      fontStyle: 'italic',
      fontWeight: 600,
      color: 'var(--accent)',
      fontSize: 28,
      lineHeight: 1
    }
  }, s.n), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: 'var(--fg-muted)',
      letterSpacing: '0.06em',
      textTransform: 'uppercase',
      marginTop: 6
    }
  }, s.l)))), /*#__PURE__*/React.createElement("div", {
    style: {
      background: 'var(--primary-dark)',
      color: '#fff',
      borderRadius: 20,
      padding: 20,
      marginBottom: 16
    }
  }, /*#__PURE__*/React.createElement("h3", {
    style: {
      fontFamily: 'var(--font-headline)',
      fontWeight: 700,
      fontSize: 22,
      margin: '0 0 6px'
    }
  }, "\u05D9\u05E9 \u05DC\u05DA \u05E2\u05E1\u05E7?"), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 14,
      color: 'rgba(234,243,222,0.85)',
      margin: '0 0 14px'
    }
  }, "\u05D1\u05D5\u05D0\u05D9 \u05D0\u05DC\u05D9\u05E0\u05D5 \u2014 \u05D7\u05D9\u05E0\u05DD, \u05DC\u05EA\u05DE\u05D9\u05D3, \u05D1\u05DC\u05D9 \u05E2\u05DE\u05DC\u05D5\u05EA."), /*#__PURE__*/React.createElement("button", {
    style: {
      background: 'var(--background)',
      color: 'var(--primary-dark)',
      border: 'none',
      padding: '12px 20px',
      borderRadius: 9999,
      fontSize: 14,
      fontWeight: 600,
      fontFamily: 'var(--font-body)',
      cursor: 'pointer'
    }
  }, "\u05D4\u05D5\u05E1\u05D9\u05E4\u05D9 \u05E2\u05E1\u05E7"))));
}

// ────────────────────────────────────────────────────────────
// SEARCH
// ────────────────────────────────────────────────────────────
function SearchScreen({
  onGo
}) {
  const [q, setQ] = React.useState('');
  const recent = ['גבינות עיזים', 'לחם מחמצת', 'שמן זית גליל'];
  return /*#__PURE__*/React.createElement("div", {
    style: {
      height: '100%',
      overflowY: 'auto',
      background: 'var(--background)',
      paddingBottom: 96
    }
  }, /*#__PURE__*/React.createElement(AppStatusBar, null), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '8px 16px 12px',
      display: 'flex',
      alignItems: 'center',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => onGo?.('discover'),
    style: {
      width: 40,
      height: 40,
      borderRadius: 9999,
      background: '#fff',
      border: '1px solid var(--border)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      cursor: 'pointer'
    }
  }, /*#__PURE__*/React.createElement(MIconChevL, null)), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      background: '#fff',
      border: '1px solid var(--border)',
      borderRadius: 9999,
      padding: '10px 16px',
      display: 'flex',
      alignItems: 'center',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement(MIconSearch, {
    stroke: "var(--primary)"
  }), /*#__PURE__*/React.createElement("input", {
    autoFocus: true,
    value: q,
    onChange: e => setQ(e.target.value),
    placeholder: "\u05D7\u05E4\u05E9\u05D9 \u05E2\u05D9\u05E8, \u05E7\u05D8\u05D2\u05D5\u05E8\u05D9\u05D4...",
    style: {
      flex: 1,
      border: 'none',
      outline: 'none',
      background: 'transparent',
      fontSize: 15,
      fontFamily: 'var(--font-body)'
    }
  }))), !q && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '12px 20px 6px',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'baseline'
    }
  }, /*#__PURE__*/React.createElement("h3", {
    style: {
      fontFamily: 'var(--font-headline)',
      fontWeight: 700,
      fontSize: 16,
      margin: 0
    }
  }, "\u05D7\u05D9\u05E4\u05D5\u05E9\u05D9\u05DD \u05D0\u05D7\u05E8\u05D5\u05E0\u05D9\u05DD"), /*#__PURE__*/React.createElement("a", {
    href: "#",
    style: {
      fontSize: 12,
      color: 'var(--primary)',
      textDecoration: 'none'
    }
  }, "\u05E0\u05E7\u05D9")), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '0 20px',
      display: 'flex',
      flexDirection: 'column',
      gap: 4
    }
  }, recent.map(r => /*#__PURE__*/React.createElement("button", {
    key: r,
    onClick: () => setQ(r),
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: '12px 4px',
      background: 'none',
      border: 'none',
      cursor: 'pointer',
      textAlign: 'start',
      borderBottom: '1px solid var(--border)'
    }
  }, /*#__PURE__*/React.createElement(MIconSearch, {
    size: 16,
    stroke: "var(--fg-muted)"
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 15,
      color: 'var(--fg)',
      fontFamily: 'var(--font-body)'
    }
  }, r)))), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '24px 20px 6px'
    }
  }, /*#__PURE__*/React.createElement("h3", {
    style: {
      fontFamily: 'var(--font-headline)',
      fontWeight: 700,
      fontSize: 16,
      margin: '0 0 10px'
    }
  }, "\u05E7\u05D8\u05D2\u05D5\u05E8\u05D9\u05D5\u05EA \u05E4\u05D5\u05E4\u05D5\u05DC\u05E8\u05D9\u05D5\u05EA")), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '0 20px',
      display: 'flex',
      gap: 8,
      flexWrap: 'wrap'
    }
  }, ['🧀 גבינות', '🍞 לחמים', '🫒 שמנים', '🥬 ירקות', '🍯 דבש', '🌿 תה ועשבים', '🧼 סבונים'].map(t => /*#__PURE__*/React.createElement("span", {
    key: t,
    style: {
      background: '#fff',
      border: '1px solid var(--border)',
      padding: '8px 14px',
      borderRadius: 9999,
      fontSize: 13
    }
  }, t)))), q && /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '0 20px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: 'var(--fg-muted)',
      padding: '8px 0',
      fontFamily: 'var(--font-body)'
    }
  }, "3 \u05EA\u05D5\u05E6\u05D0\u05D5\u05EA \u05DC\"", q, "\""), (window.SAMPLE_PRODUCERS || []).slice(0, 3).map(p => /*#__PURE__*/React.createElement("button", {
    key: p.id,
    onClick: () => onGo?.('detail'),
    style: {
      width: '100%',
      display: 'flex',
      gap: 12,
      background: '#fff',
      border: '1px solid var(--border)',
      borderRadius: 14,
      padding: 10,
      marginBottom: 10,
      cursor: 'pointer',
      textAlign: 'start'
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: p.img,
    alt: p.name,
    style: {
      width: 60,
      height: 60,
      borderRadius: 10,
      objectFit: 'cover'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 6
    }
  }, /*#__PURE__*/React.createElement("h4", {
    style: {
      fontFamily: 'var(--font-headline)',
      fontWeight: 700,
      fontSize: 15,
      margin: 0
    }
  }, p.name), p.verified && /*#__PURE__*/React.createElement(MIconSeal, {
    size: 11,
    fill: "var(--primary)"
  })), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 12,
      color: 'var(--fg-muted)',
      margin: '2px 0 0'
    }
  }, p.city, " \xB7 ", p.category))))));
}
Object.assign(window, {
  DiscoverScreen,
  MapScreen,
  DetailScreen,
  AboutScreen,
  SearchScreen,
  MobileTabBar,
  AppStatusBar
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/mobile/screens.jsx", error: String((e && e.message) || e) }); }

// ui_kits/website/CategoryGrid.jsx
try { (() => {
const CATEGORY_LIST = [{
  key: 'veg',
  name: 'ירקות, פירות ומשקים',
  img: 'https://images.unsplash.com/photo-1540420773420-3366772f4999?w=900&auto=format&q=80',
  span: 2
}, {
  key: 'bread',
  name: 'לחמים ואפייה',
  img: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=600&auto=format&q=80'
}, {
  key: 'dairy',
  name: 'חלב וגבינות',
  img: 'https://images.unsplash.com/photo-1771578742735-36009188c207?w=600&auto=format&q=80'
}, {
  key: 'oil',
  name: 'שמנים ודבש',
  img: 'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=600&auto=format&q=80'
}, {
  key: 'meat',
  name: 'בשר, עוף ודגים',
  img: 'https://images.unsplash.com/photo-1607623814075-e51df1bdc82f?w=600&auto=format&q=80'
}, {
  key: 'care',
  name: 'טיפוח וסבונים',
  img: 'https://images.unsplash.com/photo-1600857544200-b2f666a9a2ec?w=600&auto=format&q=80'
}];
function CategoryGrid({
  onClick
}) {
  return /*#__PURE__*/React.createElement("section", {
    style: {
      maxWidth: 'var(--container-max)',
      margin: '0 auto',
      padding: '40px 16px 80px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'end',
      justifyContent: 'space-between',
      marginBottom: 32,
      gap: 24,
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "eyebrow",
    style: {
      color: 'var(--accent)',
      marginBottom: 10
    }
  }, "BY CATEGORY \xB7 \u05D2\u05DC\u05D9 \u05DC\u05E4\u05D9"), /*#__PURE__*/React.createElement("h2", {
    style: {
      fontFamily: 'var(--font-headline)',
      fontWeight: 700,
      fontSize: 'clamp(32px, 4vw, 52px)',
      lineHeight: 1.05,
      margin: 0,
      color: 'var(--fg)'
    }
  }, "\u05DB\u05DC \u05D4\u05E7\u05D8\u05D2\u05D5\u05E8\u05D9\u05D5\u05EA,", /*#__PURE__*/React.createElement("br", null), "\u05D1\u05DC\u05D9 \u05DE\u05EA\u05D5\u05D5\u05DB\u05D9\u05DD.")), /*#__PURE__*/React.createElement("a", {
    href: "#",
    style: {
      color: 'var(--primary)',
      fontSize: 14,
      textDecoration: 'none'
    }
  }, "\u05E8\u05D0\u05D9 \u05D4\u05DB\u05DC \u2190")), /*#__PURE__*/React.createElement("div", {
    className: "cat-grid",
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(3, 1fr)',
      gridAutoRows: '260px',
      gap: 16
    }
  }, CATEGORY_LIST.map((c, i) => /*#__PURE__*/React.createElement("button", {
    key: c.key,
    onClick: () => onClick?.(c),
    style: {
      gridColumn: c.span === 2 ? 'span 2' : 'span 1',
      position: 'relative',
      border: 'none',
      padding: 0,
      cursor: 'pointer',
      borderRadius: 'var(--radius-md)',
      overflow: 'hidden',
      textAlign: 'start',
      background: `url(${c.img}) center/cover`
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      background: 'linear-gradient(to top, rgba(46,74,46,0.72) 0%, rgba(46,74,46,0.15) 60%, rgba(0,0,0,0) 100%)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: 16,
      insetInlineEnd: 16,
      color: 'rgba(255,255,255,0.8)',
      fontFamily: 'var(--font-english)',
      fontStyle: 'italic',
      fontWeight: 600,
      fontSize: 28
    }
  }, String(i + 1).padStart(2, '0')), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      bottom: 20,
      insetInlineStart: 20,
      insetInlineEnd: 20,
      color: '#fff'
    }
  }, /*#__PURE__*/React.createElement(CategoryLineArt, {
    type: c.key,
    size: 44,
    stroke: "#fff",
    strokeWidth: 1.6
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-headline)',
      fontWeight: 700,
      fontSize: 22,
      marginTop: 8
    }
  }, c.name))))), /*#__PURE__*/React.createElement("style", null, `
        @media (max-width: 720px) {
          .cat-grid { grid-template-columns: repeat(2, 1fr) !important; grid-auto-rows: 180px !important; }
          .cat-grid button[style*="span 2"] { grid-column: span 2 !important; }
        }
      `));
}
window.CategoryGrid = CategoryGrid;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/website/CategoryGrid.jsx", error: String((e && e.message) || e) }); }

// ui_kits/website/EditorialSections.jsx
try { (() => {
function TrustBar() {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      background: 'var(--primary)',
      color: '#fff',
      textAlign: 'center',
      padding: '14px 16px',
      fontFamily: 'var(--font-body)',
      fontSize: 15,
      letterSpacing: '0.02em'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontWeight: 600
    }
  }, "248"), " \u05D1\u05EA\u05D9 \u05E2\u05E1\u05E7 \u05DE\u05D0\u05D5\u05DE\u05EA\u05D9\u05DD \xA0\xB7\xA0", /*#__PURE__*/React.createElement("span", {
    style: {
      fontWeight: 600
    }
  }, "12"), " \u05E7\u05D8\u05D2\u05D5\u05E8\u05D9\u05D5\u05EA \xA0\xB7\xA0 \u05DE\u05DB\u05DC \u05E8\u05D7\u05D1\u05D9 \u05D4\u05D0\u05E8\u05E5");
}
function EditorialIntro() {
  return /*#__PURE__*/React.createElement("section", {
    style: {
      maxWidth: 980,
      margin: '0 auto',
      padding: '120px 24px',
      textAlign: 'start'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "eyebrow",
    style: {
      color: 'var(--accent)',
      marginBottom: 32
    }
  }, "ON OUR TABLE \xB7 \u05DE\u05D4\u05DE\u05E2\u05E8\u05DB\u05EA"), /*#__PURE__*/React.createElement("p", {
    style: {
      fontFamily: 'var(--font-headline)',
      fontWeight: 400,
      fontStyle: 'italic',
      fontSize: 'clamp(28px, 4vw, 52px)',
      lineHeight: 1.25,
      color: 'var(--fg)',
      margin: 0
    }
  }, "\u05DB\u05E9\u05D0\u05EA \u05D9\u05D5\u05D3\u05E2\u05EA \u05D0\u05EA \u05D4\u05E9\u05DD \u05E9\u05DC \u05D6\u05D0\u05EA \u05E9\u05D0\u05E4\u05EA\u05D4 \u05D0\u05EA \u05D4\u05DC\u05D7\u05DD \u05E9\u05DC\u05DA \u2014 \u05D4\u05DB\u05DC \u05D8\u05D5\u05E2\u05DD \u05D0\u05D7\u05E8\u05EA. \u05D0\u05E0\u05D7\u05E0\u05D5 \u05DC\u05D0 \u05E9\u05D5\u05E7, \u05DC\u05D0 \u05DE\u05E9\u05DC\u05D5\u05D7, \u05DC\u05D0 \u05E2\u05D5\u05D3 \u05D0\u05E4\u05DC\u05D9\u05E7\u05E6\u05D9\u05D4.", /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--accent)'
    }
  }, "\xA0\u05E8\u05E7 \u05DE\u05E4\u05D4 \u05E9\u05DC \u05D0\u05E0\u05E9\u05D9\u05DD \u05D0\u05DE\u05D9\u05EA\u05D9\u05D9\u05DD.")), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 40,
      display: 'flex',
      alignItems: 'center',
      gap: 16
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "80",
    height: "28",
    viewBox: "0 0 80 28",
    fill: "none",
    stroke: "var(--primary)",
    strokeWidth: "1.5",
    strokeLinecap: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M4 20 C 14 6 26 24 40 12 C 54 2 66 22 76 14"
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-english)',
      fontStyle: 'italic',
      fontSize: 18,
      color: 'var(--fg)'
    }
  }, "\u05E1\u05E4\u05D9\u05E8 \u05DB\u05D4\u05DF"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: 'var(--fg-muted)'
    }
  }, "\u05DE\u05D9\u05D9\u05E1\u05D3\u05EA \u05DE\u05D4\u05DE\u05E7\u05D5\u05E8"))));
}
window.TrustBar = TrustBar;
window.EditorialIntro = EditorialIntro;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/website/EditorialSections.jsx", error: String((e && e.message) || e) }); }

// ui_kits/website/Header.jsx
try { (() => {
// Header — sticky cream navbar, blurs on scroll.
const {
  useState: hUseState,
  useEffect: hUseEffect
} = React;
function Header({
  onNav
}) {
  const [scrolled, setScrolled] = hUseState(false);
  const [menu, setMenu] = hUseState(false);
  hUseEffect(() => {
    const on = () => setScrolled(window.scrollY > 60);
    window.addEventListener('scroll', on, {
      passive: true
    });
    on();
    return () => window.removeEventListener('scroll', on);
  }, []);
  const nav = [{
    k: 'discover',
    l: 'לגלות'
  }, {
    k: 'map',
    l: 'מפה'
  }, {
    k: 'events',
    l: 'אירועים'
  }, {
    k: 'neighbor',
    l: 'מהמטבח של השכן'
  }, {
    k: 'about',
    l: 'עלינו'
  }];
  return /*#__PURE__*/React.createElement("header", {
    style: {
      position: 'sticky',
      top: 0,
      zIndex: 50,
      background: scrolled ? 'rgba(245,240,232,0.85)' : 'var(--background)',
      backdropFilter: scrolled ? 'blur(12px)' : 'none',
      borderBottom: `1px solid ${scrolled ? 'var(--border)' : 'transparent'}`,
      boxShadow: scrolled ? 'var(--shadow-header)' : 'none',
      transition: 'all 300ms var(--ease-out)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 'var(--container-max)',
      margin: '0 auto',
      padding: '0 16px',
      height: 72,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 24
    }
  }, /*#__PURE__*/React.createElement("a", {
    href: "#",
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      textDecoration: 'none'
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: "../../assets/logo.png",
    alt: "\u05DE\u05D4\u05DE\u05E7\u05D5\u05E8",
    style: {
      height: 36
    }
  })), /*#__PURE__*/React.createElement("nav", {
    className: "desktop-nav",
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 24
    }
  }, nav.map(n => /*#__PURE__*/React.createElement("a", {
    key: n.k,
    href: "#",
    onClick: e => {
      e.preventDefault();
      onNav?.(n.k);
    },
    style: {
      color: 'var(--fg-muted)',
      textDecoration: 'none',
      fontSize: 15,
      transition: 'color .25s'
    },
    onMouseOver: e => e.currentTarget.style.color = 'var(--primary)',
    onMouseOut: e => e.currentTarget.style.color = 'var(--fg-muted)'
  }, n.l)), /*#__PURE__*/React.createElement("a", {
    href: "#",
    onClick: e => {
      e.preventDefault();
      onNav?.('register');
    },
    style: {
      background: 'var(--primary)',
      color: '#fff',
      padding: '10px 18px',
      borderRadius: 9999,
      textDecoration: 'none',
      fontSize: 14,
      fontWeight: 500
    }
  }, "\u05D4\u05D5\u05E1\u05D9\u05E4\u05D9 \u05D0\u05EA \u05D4\u05E2\u05E1\u05E7 \u05E9\u05DC\u05DA"), /*#__PURE__*/React.createElement("span", {
    className: "eyebrow",
    style: {
      border: '1px solid var(--border)',
      padding: '4px 10px',
      borderRadius: 9999,
      fontSize: 11,
      color: 'var(--fg-muted)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--primary)',
      fontWeight: 700
    }
  }, "\u05E2\u05D1"), " / EN")), /*#__PURE__*/React.createElement("button", {
    className: "mobile-only",
    "aria-label": "\u05E4\u05EA\u05D7 \u05EA\u05E4\u05E8\u05D9\u05D8",
    onClick: () => setMenu(!menu),
    style: {
      background: 'none',
      border: 'none',
      color: 'var(--fg)',
      cursor: 'pointer',
      padding: 8
    }
  }, /*#__PURE__*/React.createElement(IconMenu, null))), menu && /*#__PURE__*/React.createElement("div", {
    className: "mobile-only",
    style: {
      background: 'var(--background)',
      borderTop: '1px solid var(--border)',
      padding: '12px 16px',
      display: 'flex',
      flexDirection: 'column',
      gap: 12
    }
  }, nav.map(n => /*#__PURE__*/React.createElement("a", {
    key: n.k,
    href: "#",
    onClick: e => {
      e.preventDefault();
      onNav?.(n.k);
      setMenu(false);
    },
    style: {
      fontFamily: 'var(--font-headline)',
      fontSize: 22,
      color: 'var(--fg)',
      textDecoration: 'none'
    }
  }, n.l)), /*#__PURE__*/React.createElement("a", {
    href: "#",
    onClick: e => {
      e.preventDefault();
      onNav?.('register');
      setMenu(false);
    },
    style: {
      color: 'var(--primary)',
      fontWeight: 600,
      fontFamily: 'var(--font-headline)',
      fontSize: 22
    }
  }, "\u05D4\u05D5\u05E1\u05D9\u05E4\u05D9 \u05D0\u05EA \u05D4\u05E2\u05E1\u05E7 \u05E9\u05DC\u05DA")));
}
window.Header = Header;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/website/Header.jsx", error: String((e && e.message) || e) }); }

// ui_kits/website/Hero.jsx
try { (() => {
// Hero — asymmetric split: large cream panel with editorial type + image panel with Ken Burns.
function Hero({
  onSearch,
  onNearMe,
  onDiscover
}) {
  const [q, setQ] = React.useState('');
  return /*#__PURE__*/React.createElement("section", {
    style: {
      position: 'relative',
      background: 'var(--background)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 'var(--container-max)',
      margin: '0 auto',
      padding: '48px 16px 80px',
      display: 'grid',
      gridTemplateColumns: '1.1fr 1fr',
      gap: 56,
      alignItems: 'center'
    },
    className: "hero-grid"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "eyebrow",
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      color: 'var(--accent)'
    }
  }, /*#__PURE__*/React.createElement("span", null, "\u05D2\u05D9\u05DC\u05D9\u05D5\u05DF 01"), /*#__PURE__*/React.createElement("span", {
    style: {
      width: 36,
      height: 1,
      background: 'var(--accent)',
      display: 'inline-block'
    }
  }), /*#__PURE__*/React.createElement("span", null, "\u05D0\u05E4\u05E8\u05D9\u05DC 2026")), /*#__PURE__*/React.createElement("h1", {
    style: {
      fontFamily: 'var(--font-headline)',
      fontWeight: 900,
      fontSize: 'clamp(48px, 7vw, 92px)',
      lineHeight: 0.95,
      letterSpacing: '-0.02em',
      color: 'var(--fg)',
      margin: '20px 0 16px',
      textAlign: 'start'
    }
  }, "\u05D0\u05D5\u05DB\u05DC \u05D0\u05DE\u05D9\u05EA\u05D9,", /*#__PURE__*/React.createElement("br", null), /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--primary)'
    }
  }, "\u05D9\u05E9\u05E8 \u05DE\u05D4\u05DE\u05E7\u05D5\u05E8"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-english)',
      fontStyle: 'italic',
      fontWeight: 600,
      color: 'var(--accent)',
      fontSize: '0.7em'
    }
  }, ", \u05D0\u05DC\u05D9\u05D9\u05DA.")), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 18,
      lineHeight: 1.6,
      color: 'var(--fg-muted)',
      maxWidth: 520,
      margin: '0 0 32px'
    }
  }, "\u05D4\u05DE\u05D3\u05E8\u05D9\u05DA \u05D4\u05E8\u05D0\u05E9\u05D5\u05DF \u05D1\u05D9\u05E9\u05E8\u05D0\u05DC \u05DC\u05D7\u05E7\u05DC\u05D0\u05D9\u05D5\u05EA, \u05D0\u05D5\u05E4\u05D5\u05EA, \u05E9\u05DB\u05E0\u05D5\u05EA \u05D5\u05DE\u05D2\u05D3\u05DC\u05D5\u05EA \u05E9\u05DE\u05D5\u05DB\u05E8\u05D5\u05EA \u05D9\u05E9\u05D9\u05E8\u05D5\u05EA \u2014 \u05D1\u05DC\u05D9 \u05DE\u05EA\u05D5\u05D5\u05DB\u05D9\u05DD, \u05D1\u05DC\u05D9 \u05E9\u05D9\u05D5\u05D5\u05E7, \u05D9\u05E9\u05E8 \u05D1\u05D5\u05D5\u05D0\u05D8\u05E1\u05D0\u05E4."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexWrap: 'wrap',
      gap: 12,
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: onDiscover,
    style: {
      background: 'var(--primary)',
      color: '#fff',
      border: 'none',
      padding: '16px 28px',
      borderRadius: 'var(--radius-md)',
      fontSize: 16,
      fontWeight: 600,
      cursor: 'pointer',
      display: 'inline-flex',
      alignItems: 'center',
      gap: 10,
      minHeight: 52
    }
  }, "\u05D2\u05DC\u05D9 \u05E2\u05E1\u05E7\u05D9\u05DD \u05E7\u05E8\u05D5\u05D1\u05D9\u05DD", /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-english)',
      fontStyle: 'italic'
    }
  }, "\u2192")), /*#__PURE__*/React.createElement("button", {
    onClick: () => onNearMe?.(),
    style: {
      background: 'transparent',
      color: 'var(--primary)',
      border: '1px solid var(--primary)',
      padding: '16px 24px',
      borderRadius: 'var(--radius-md)',
      fontSize: 15,
      fontWeight: 500,
      cursor: 'pointer',
      minHeight: 52,
      display: 'inline-flex',
      alignItems: 'center',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement(IconCrosshair, {
    size: 18
  }), " \u05D0\u05D9\u05DA \u05D6\u05D4 \u05E2\u05D5\u05D1\u05D3")), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 40,
      display: 'flex',
      gap: 24,
      alignItems: 'center',
      flexWrap: 'wrap',
      paddingTop: 24,
      borderTop: '1px solid var(--border)'
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-english)',
      fontStyle: 'italic',
      fontWeight: 600,
      color: 'var(--accent)',
      fontSize: 28
    }
  }, "248"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: 'var(--fg-muted)',
      letterSpacing: '0.08em',
      textTransform: 'uppercase'
    }
  }, "\u05D1\u05EA\u05D9 \u05E2\u05E1\u05E7 \u05DE\u05D0\u05D5\u05DE\u05EA\u05D9\u05DD")), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-english)',
      fontStyle: 'italic',
      fontWeight: 600,
      color: 'var(--accent)',
      fontSize: 28
    }
  }, "12"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: 'var(--fg-muted)',
      letterSpacing: '0.08em',
      textTransform: 'uppercase'
    }
  }, "\u05E7\u05D8\u05D2\u05D5\u05E8\u05D9\u05D5\u05EA")), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-english)',
      fontStyle: 'italic',
      fontWeight: 600,
      color: 'var(--accent)',
      fontSize: 28
    }
  }, "\uD83C\uDDEE\uD83C\uDDF1"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: 'var(--fg-muted)',
      letterSpacing: '0.08em',
      textTransform: 'uppercase'
    }
  }, "\u05DE\u05DB\u05DC \u05E8\u05D7\u05D1\u05D9 \u05D4\u05D0\u05E8\u05E5")))), /*#__PURE__*/React.createElement("div", {
    className: "hero-image",
    style: {
      position: 'relative',
      aspectRatio: '4/5',
      borderRadius: 24,
      overflow: 'hidden',
      background: '#c9b28a'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: '-5%',
      backgroundImage: 'url(https://images.unsplash.com/photo-1542838132-92c53300491e?w=1200&auto=format&q=80)',
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      animation: 'kenburns 20s ease-in-out infinite alternate'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      background: 'linear-gradient(to top, rgba(46,74,46,0.55) 0%, rgba(0,0,0,0) 60%)'
    }
  }), /*#__PURE__*/React.createElement("svg", {
    style: {
      position: 'absolute',
      top: 20,
      left: 20,
      color: '#fff',
      opacity: 0.9
    },
    width: "52",
    height: "52",
    viewBox: "0 0 52 52",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2.5",
    strokeLinecap: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M8 28 C 14 26 18 30 22 32 C 28 34 34 20 46 10",
    style: {
      strokeDasharray: '100',
      strokeDashoffset: 0
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      bottom: 24,
      insetInlineStart: 24,
      insetInlineEnd: 24,
      color: '#fff'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "eyebrow",
    style: {
      color: 'rgba(255,255,255,0.85)',
      marginBottom: 6
    }
  }, "FEATURED \xB7 \u05D4\u05E9\u05D1\u05D5\u05E2"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-headline)',
      fontWeight: 700,
      fontSize: 22,
      lineHeight: 1.25
    }
  }, "\u05D4\u05D7\u05D5\u05D5\u05D4 \u05E9\u05DC \u05DE\u05E8\u05D9\u05DD, \u05D2\u05DC\u05D9\u05DC \u05E2\u05DC\u05D9\u05D5\u05DF"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      opacity: 0.85
    }
  }, "\u05D2\u05D1\u05D9\u05E0\u05D5\u05EA \u05E2\u05D9\u05D6\u05D9\u05DD \xB7 \u05D7\u05DC\u05D1 \u05D8\u05E8\u05D9 \xB7 \u05DC\u05D7\u05DD \u05DE\u05D7\u05DE\u05E6\u05EA")))), /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 'var(--container-max)',
      margin: '-40px auto 0',
      padding: '0 16px',
      position: 'relative'
    }
  }, /*#__PURE__*/React.createElement("form", {
    onSubmit: e => {
      e.preventDefault();
      onSearch?.(q);
    },
    style: {
      background: '#fff',
      borderRadius: 9999,
      border: '1px solid var(--border)',
      padding: '6px 8px 6px 24px',
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      boxShadow: 'var(--shadow-card)',
      maxWidth: 680,
      marginInline: 'auto'
    }
  }, /*#__PURE__*/React.createElement(IconSearch, {
    stroke: "var(--primary)"
  }), /*#__PURE__*/React.createElement("input", {
    value: q,
    onChange: e => setQ(e.target.value),
    placeholder: "\u05D7\u05E4\u05E9\u05D9 \u05E2\u05D9\u05E8, \u05E7\u05D8\u05D2\u05D5\u05E8\u05D9\u05D4 \u05D0\u05D5 \u05D1\u05D9\u05EA \u05E2\u05E1\u05E7...",
    style: {
      flex: 1,
      border: 'none',
      outline: 'none',
      fontSize: 16,
      background: 'transparent',
      color: 'var(--fg)',
      fontFamily: 'var(--font-body)'
    }
  }), /*#__PURE__*/React.createElement("button", {
    type: "submit",
    style: {
      background: 'var(--primary)',
      color: '#fff',
      border: 'none',
      padding: '12px 24px',
      borderRadius: 9999,
      cursor: 'pointer',
      fontSize: 14,
      fontWeight: 500
    }
  }, "\u05D7\u05E4\u05E9\u05D9"))), /*#__PURE__*/React.createElement("style", null, `
        @keyframes kenburns { 0% { transform: scale(1) translate(0,0);} 100% { transform: scale(1.08) translate(-2%,-1%);} }
        @media (max-width: 820px) {
          .hero-grid { grid-template-columns: 1fr !important; gap: 32px !important; padding-bottom: 120px !important; }
          .hero-image { aspect-ratio: 3/4 !important; }
        }
      `));
}
window.Hero = Hero;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/website/Hero.jsx", error: String((e && e.message) || e) }); }

// ui_kits/website/ProducerCard.jsx
try { (() => {
function ProducerCard({
  p,
  onClick
}) {
  return /*#__PURE__*/React.createElement("article", {
    style: {
      background: '#fff',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-md)',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      cursor: 'pointer',
      transition: 'transform .3s var(--ease-out), box-shadow .3s var(--ease-out)'
    },
    onMouseEnter: e => {
      e.currentTarget.style.transform = 'translateY(-2px)';
      e.currentTarget.style.boxShadow = 'var(--shadow-card)';
    },
    onMouseLeave: e => {
      e.currentTarget.style.transform = 'none';
      e.currentTarget.style.boxShadow = 'none';
    },
    onClick: () => onClick?.(p)
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      aspectRatio: '4/3',
      background: 'var(--light)',
      overflow: 'hidden'
    }
  }, p.img ? /*#__PURE__*/React.createElement("img", {
    src: p.img,
    alt: p.name,
    style: {
      width: '100%',
      height: '100%',
      objectFit: 'cover'
    }
  }) : /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'column',
      color: 'var(--primary)'
    }
  }, /*#__PURE__*/React.createElement(IconLeaf, {
    size: 48,
    stroke: "var(--primary)"
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-headline)',
      fontWeight: 700,
      fontSize: 28,
      marginTop: 6
    }
  }, p.name?.slice(0, 1))), /*#__PURE__*/React.createElement("button", {
    "aria-label": "\u05E9\u05DE\u05E8\u05D9 \u05DC\u05DE\u05D5\u05E2\u05D3\u05E4\u05D9\u05DD",
    style: {
      position: 'absolute',
      top: 10,
      insetInlineStart: 10,
      width: 44,
      height: 44,
      borderRadius: 9999,
      background: 'rgba(255,255,255,0.95)',
      border: 'none',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: p.saved ? '#e8823a' : 'var(--fg-muted)'
    }
  }, /*#__PURE__*/React.createElement(IconHeart, {
    size: 20,
    fill: p.saved ? 'currentColor' : 'none'
  })), p.verified && /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      top: 12,
      insetInlineEnd: 12,
      background: 'var(--primary)',
      color: '#fff',
      fontSize: 11,
      padding: '4px 10px',
      borderRadius: 9999,
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      fontWeight: 600
    }
  }, /*#__PURE__*/React.createElement(IconSeal, {
    size: 12
  }), " \u05DE\u05D0\u05D5\u05DE\u05EA"), p.premium && /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      top: 48,
      insetInlineEnd: 12,
      background: 'var(--accent)',
      color: '#fff',
      fontSize: 11,
      padding: '4px 10px',
      borderRadius: 9999,
      fontWeight: 600
    }
  }, "\u05E4\u05E8\u05DE\u05D9\u05D5\u05DD"), p.today && /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      bottom: 12,
      insetInlineEnd: 12,
      background: 'var(--secondary)',
      color: '#fff',
      fontSize: 11,
      padding: '4px 10px',
      borderRadius: 9999,
      fontWeight: 600
    }
  }, "\u05D6\u05DE\u05D9\u05DF \u05D4\u05D9\u05D5\u05DD")), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: 16,
      display: 'flex',
      flexDirection: 'column',
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("h3", {
    style: {
      fontFamily: 'var(--font-headline)',
      fontWeight: 700,
      fontSize: 20,
      margin: 0,
      color: 'var(--fg)',
      lineHeight: 1.25
    }
  }, p.name), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 13,
      color: 'var(--fg-muted)',
      margin: '6px 0 0'
    }
  }, p.city, " \xB7 ", p.category), p.top && /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 14,
      color: 'var(--fg)',
      margin: '8px 0 0',
      opacity: 0.85
    }
  }, p.top), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexWrap: 'wrap',
      gap: 6,
      marginTop: 10
    }
  }, p.tags?.map(t => /*#__PURE__*/React.createElement("span", {
    key: t,
    style: {
      background: 'var(--light)',
      color: 'var(--primary)',
      padding: '3px 10px',
      borderRadius: 20,
      fontSize: 12
    }
  }, t))), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 'auto',
      paddingTop: 12,
      borderTop: '1px solid var(--border)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 2
    }
  }, /*#__PURE__*/React.createElement("a", {
    href: "#",
    onClick: e => e.stopPropagation(),
    "aria-label": "WhatsApp",
    style: {
      width: 44,
      height: 44,
      borderRadius: 9999,
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'var(--primary)',
      textDecoration: 'none'
    }
  }, /*#__PURE__*/React.createElement(IconWhatsApp, {
    size: 20
  })), /*#__PURE__*/React.createElement("a", {
    href: "#",
    onClick: e => e.stopPropagation(),
    "aria-label": "\u05D8\u05DC\u05E4\u05D5\u05DF",
    style: {
      width: 44,
      height: 44,
      borderRadius: 9999,
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'var(--primary)'
    }
  }, /*#__PURE__*/React.createElement(IconPhone, null)), /*#__PURE__*/React.createElement("a", {
    href: "#",
    onClick: e => e.stopPropagation(),
    "aria-label": "Instagram",
    style: {
      width: 44,
      height: 44,
      borderRadius: 9999,
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'var(--primary)'
    }
  }, /*#__PURE__*/React.createElement(IconInstagram, null))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10
    }
  }, p.price && /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-english)',
      fontStyle: 'italic',
      fontWeight: 500,
      color: 'var(--accent)',
      fontSize: 15
    }
  }, p.price)))));
}
window.ProducerCard = ProducerCard;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/website/ProducerCard.jsx", error: String((e && e.message) || e) }); }

// ui_kits/website/ProducerGrid.jsx
try { (() => {
const SAMPLE_PRODUCERS = [{
  id: 1,
  name: 'החווה של מרים',
  city: 'גליל עליון',
  category: '🧀 גבינות',
  img: 'https://images.unsplash.com/photo-1486297678162-eb2a19b0a32d?w=700&auto=format&q=80',
  price: 'מ-₪ 28',
  verified: true,
  premium: true,
  today: true,
  tags: ['🌿 אורגני', '✡️ מהדרין'],
  top: 'גבינת עיזים טרייה בעירוי צלול',
  saved: true
}, {
  id: 2,
  name: 'מאפיית לאה',
  city: 'רמת גן',
  category: '🍞 מחמצת',
  img: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=700&auto=format&q=80',
  price: 'מ-₪ 42',
  verified: true,
  tags: ['🍞 מחמצת', 'שיפון מלא']
}, {
  id: 3,
  name: 'שמן מעין זית',
  city: 'הגליל',
  category: '🫒 שמנים',
  img: 'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=700&auto=format&q=80',
  price: '₪ 78 / 500מ״ל',
  verified: true,
  premium: true,
  tags: ['כתית מעולה']
}, {
  id: 4,
  name: 'הגינה של שרונה',
  city: 'מודיעין',
  category: '🥬 ירקות',
  img: 'https://images.unsplash.com/photo-1540420773420-3366772f4999?w=700&auto=format&q=80',
  today: true,
  verified: true,
  tags: ['🌿 אורגני', '🚚 משלוח'],
  top: 'סלסלת ירקות עונתית'
}];
function ProducerGrid({
  onCardClick
}) {
  const [active, setActive] = React.useState('all');
  const filters = [{
    k: 'all',
    l: 'הכל'
  }, {
    k: 'kosher',
    l: '✡️ כשר'
  }, {
    k: 'organic',
    l: '🌿 אורגני'
  }, {
    k: 'delivery',
    l: '🚚 משלוח'
  }, {
    k: 'verified',
    l: '✅ מאומת'
  }];
  return /*#__PURE__*/React.createElement("section", {
    id: "producers",
    style: {
      maxWidth: 'var(--container-max)',
      margin: '0 auto',
      padding: '48px 16px 80px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      marginBottom: 24,
      flexWrap: 'wrap',
      gap: 12
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "eyebrow",
    style: {
      color: 'var(--accent)',
      marginBottom: 8
    }
  }, "THIS WEEK \xB7 \u05DE\u05D5\u05DE\u05DC\u05E6\u05D5\u05EA \u05D4\u05E9\u05D1\u05D5\u05E2"), /*#__PURE__*/React.createElement("h2", {
    style: {
      fontFamily: 'var(--font-headline)',
      fontWeight: 700,
      fontSize: 'clamp(28px, 3.5vw, 44px)',
      margin: 0
    }
  }, "\u05D4\u05E9\u05D1\u05D5\u05E2 \u05D0\u05E0\u05D7\u05E0\u05D5 \u05D0\u05D5\u05D4\u05D1\u05D5\u05EA")), /*#__PURE__*/React.createElement("a", {
    href: "#",
    style: {
      color: 'var(--primary)',
      fontSize: 14,
      textDecoration: 'none'
    }
  }, "\u05D4\u05E6\u05D2 \u05D1\u05DE\u05E4\u05D4 \uD83D\uDDFA\uFE0F")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 10,
      marginBottom: 24,
      overflowX: 'auto',
      paddingBottom: 4
    }
  }, filters.map(f => /*#__PURE__*/React.createElement("button", {
    key: f.k,
    onClick: () => setActive(f.k),
    style: {
      padding: '8px 16px',
      borderRadius: 9999,
      fontSize: 13,
      fontWeight: 500,
      border: active === f.k ? '1px solid var(--primary)' : '1px solid var(--border)',
      background: active === f.k ? 'var(--primary)' : '#fff',
      color: active === f.k ? '#fff' : 'var(--fg)',
      whiteSpace: 'nowrap',
      cursor: 'pointer',
      fontFamily: 'var(--font-body)'
    }
  }, f.l))), /*#__PURE__*/React.createElement("div", {
    className: "producer-grid",
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(4, 1fr)',
      gap: 20
    }
  }, SAMPLE_PRODUCERS.map(p => /*#__PURE__*/React.createElement(ProducerCard, {
    key: p.id,
    p: p,
    onClick: onCardClick
  }))), /*#__PURE__*/React.createElement("style", null, `
        @media (max-width: 960px) { .producer-grid { grid-template-columns: repeat(2, 1fr) !important; gap: 12px !important; } }
      `));
}
window.ProducerGrid = ProducerGrid;
window.SAMPLE_PRODUCERS = SAMPLE_PRODUCERS;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/website/ProducerGrid.jsx", error: String((e && e.message) || e) }); }

// ui_kits/website/Sections.jsx
try { (() => {
function HowItWorks() {
  const steps = [{
    n: '01',
    title: 'גלי',
    body: 'חפשי לפי עיר, קטגוריה או פשוט סמני "קרוב אלי". כל בית עסק עם סיפור, תמונות, וציון אחרון של השכנות.'
  }, {
    n: '02',
    title: 'צרי קשר',
    body: 'כפתור WhatsApp אחד. בלי טפסים. בלי מתווכים. דברי ישר עם מי שגידלה או אפתה.'
  }, {
    n: '03',
    title: 'קבלי',
    body: 'איסוף עצמי, משלוח מקומי, או שיחה ידידותית. אוכל אמיתי, ישר מהמקור — בלי הנחות על האיכות.'
  }];
  return /*#__PURE__*/React.createElement("section", {
    style: {
      background: 'var(--background)',
      borderBlock: '1px solid var(--border)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 'var(--container-max)',
      margin: '0 auto',
      padding: '96px 24px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "eyebrow",
    style: {
      color: 'var(--accent)',
      marginBottom: 12,
      textAlign: 'center'
    }
  }, "HOW IT WORKS \xB7 \u05D0\u05D9\u05DA \u05D6\u05D4 \u05E2\u05D5\u05D1\u05D3"), /*#__PURE__*/React.createElement("h2", {
    style: {
      fontFamily: 'var(--font-headline)',
      fontWeight: 700,
      fontSize: 'clamp(32px, 4vw, 52px)',
      textAlign: 'center',
      margin: '0 0 64px'
    }
  }, "\u05E9\u05DC\u05D5\u05E9\u05D4 \u05E6\u05E2\u05D3\u05D9\u05DD,", /*#__PURE__*/React.createElement("br", null), "\u05E9\u05D5\u05DD \u05D8\u05E8\u05D9\u05E7."), /*#__PURE__*/React.createElement("div", {
    className: "hiw-grid",
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(3, 1fr)',
      gap: 48
    }
  }, steps.map((s, i) => /*#__PURE__*/React.createElement("div", {
    key: s.n,
    style: {
      position: 'relative'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-english)',
      fontStyle: 'italic',
      fontWeight: 600,
      color: 'var(--accent)',
      fontSize: 64,
      lineHeight: 1
    }
  }, s.n), /*#__PURE__*/React.createElement("div", {
    style: {
      width: 40,
      height: 1,
      background: 'var(--border)',
      margin: '20px 0'
    }
  }), /*#__PURE__*/React.createElement("h3", {
    style: {
      fontFamily: 'var(--font-headline)',
      fontWeight: 700,
      fontSize: 28,
      margin: '0 0 12px',
      color: 'var(--fg)'
    }
  }, s.title), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 16,
      lineHeight: 1.7,
      color: 'var(--fg-muted)',
      margin: 0
    }
  }, s.body), i < 2 && /*#__PURE__*/React.createElement("svg", {
    style: {
      position: 'absolute',
      top: 22,
      insetInlineStart: -32,
      color: 'var(--border)'
    },
    width: "56",
    height: "24",
    viewBox: "0 0 56 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.5",
    strokeLinecap: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M4 12 C 14 4 26 20 36 10 C 42 4 48 14 52 12"
  })))))), /*#__PURE__*/React.createElement("style", null, `@media (max-width: 720px) { .hiw-grid { grid-template-columns: 1fr !important; gap: 48px !important; } }`));
}
function FeaturedProducer() {
  return /*#__PURE__*/React.createElement("section", {
    style: {
      maxWidth: 'var(--container-max)',
      margin: '0 auto',
      padding: '80px 16px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "eyebrow",
    style: {
      color: 'var(--accent)',
      marginBottom: 12
    }
  }, "MEET A PRODUCER \xB7 \u05D4\u05DB\u05D9\u05E8\u05D9"), /*#__PURE__*/React.createElement("div", {
    className: "feat-grid",
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 64,
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      aspectRatio: '4/5',
      borderRadius: 'var(--radius-lg)',
      overflow: 'hidden',
      background: '#c9b28a'
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: "https://images.unsplash.com/photo-1580837119756-563d608dd119?w=900&auto=format&q=80",
    alt: "\u05DE\u05E8\u05D9\u05DD \u05D1\u05DE\u05D7\u05DC\u05D1\u05D4",
    style: {
      width: '100%',
      height: '100%',
      objectFit: 'cover'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: 16,
      insetInlineEnd: 16,
      background: 'rgba(245,240,232,0.95)',
      padding: '6px 14px',
      borderRadius: 9999,
      fontSize: 12,
      color: 'var(--primary)',
      fontWeight: 600
    }
  }, "\u2B50 4.9 \xB7 87 \u05D7\u05D5\u05D5\u05EA \u05D3\u05E2\u05EA")), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h2", {
    style: {
      fontFamily: 'var(--font-headline)',
      fontWeight: 900,
      fontSize: 'clamp(40px, 5vw, 72px)',
      lineHeight: 0.95,
      letterSpacing: '-0.02em',
      margin: '0 0 16px',
      color: 'var(--fg)'
    }
  }, "\u05DE\u05E8\u05D9\u05DD \u05DE", /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--primary)'
    }
  }, "\u05DE\u05E2\u05DC\u05D5\u05EA"), ",", /*#__PURE__*/React.createElement("br", null), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-english)',
      fontStyle: 'italic',
      fontWeight: 600,
      color: 'var(--accent)'
    }
  }, "\u05D2\u05D1\u05D9\u05E0\u05D0\u05D9\u05EA.")), /*#__PURE__*/React.createElement("p", {
    style: {
      fontFamily: 'var(--font-headline)',
      fontStyle: 'italic',
      fontSize: 22,
      lineHeight: 1.5,
      color: 'var(--fg)',
      margin: '0 0 24px',
      maxWidth: 520
    }
  }, "\"11 \u05E2\u05D9\u05D6\u05D9\u05DD, 4 \u05D6\u05E0\u05D9 \u05D2\u05D1\u05D9\u05E0\u05D4, 0 \u05E4\u05E9\u05E8\u05D5\u05EA. \u05D0\u05E0\u05D9 \u05DE\u05DB\u05D9\u05E8\u05D4 \u05DB\u05DC \u05D9\u05DC\u05D3\u05D4 \u05E9\u05D1\u05D0\u05D4 \u05DC\u05E7\u05D7\u05EA \u05DE\u05D4\u05D2\u05D1\u05D9\u05E0\u05D5\u05EA \u05E9\u05DC\u05D9 \u2014 \u05D5\u05D6\u05D4 \u05DE\u05D4 \u05E9\u05E2\u05D5\u05E9\u05D4 \u05D0\u05EA \u05D4\u05D4\u05D1\u05D3\u05DC.\""), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexWrap: 'wrap',
      gap: 8,
      marginBottom: 24
    }
  }, ['🌿 אורגני', '🐐 חלב גולמי', '✡️ מהדרין', '🚚 משלוח בצפון'].map(t => /*#__PURE__*/React.createElement("span", {
    key: t,
    style: {
      background: 'var(--light)',
      color: 'var(--primary)',
      padding: '6px 14px',
      borderRadius: 9999,
      fontSize: 13
    }
  }, t))), /*#__PURE__*/React.createElement("button", {
    style: {
      background: '#25D366',
      color: '#fff',
      border: 'none',
      padding: '14px 24px',
      borderRadius: 'var(--radius-md)',
      fontSize: 15,
      fontWeight: 600,
      cursor: 'pointer',
      display: 'inline-flex',
      alignItems: 'center',
      gap: 10,
      minHeight: 52
    }
  }, /*#__PURE__*/React.createElement(IconWhatsApp, {
    size: 20
  }), " \u05D3\u05D1\u05E8\u05D9 \u05E2\u05DD \u05DE\u05E8\u05D9\u05DD \u05D1\u05D5\u05D5\u05D0\u05D8\u05E1\u05D0\u05E4"))), /*#__PURE__*/React.createElement("style", null, `@media (max-width: 820px) { .feat-grid { grid-template-columns: 1fr !important; gap: 32px !important; } }`));
}
function BusinessCTA() {
  return /*#__PURE__*/React.createElement("section", {
    style: {
      background: 'var(--primary-dark)',
      color: '#fff',
      padding: '96px 16px',
      position: 'relative',
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("svg", {
    style: {
      position: 'absolute',
      insetInlineEnd: -40,
      top: -40,
      color: 'rgba(255,255,255,0.08)',
      transform: 'rotate(12deg)'
    },
    width: "400",
    height: "400",
    viewBox: "0 0 64 64",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.2"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M32 52 L32 20"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M32 20 C32 20 18 16 14 28 C18 28 26 26 32 32"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M32 28 C32 28 44 20 50 30 C46 32 38 30 32 36"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 700,
      margin: '0 auto',
      textAlign: 'center',
      position: 'relative'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "eyebrow",
    style: {
      color: '#EAF3DE',
      marginBottom: 16
    }
  }, "FOR BUSINESSES \xB7 \u05DC\u05D1\u05EA\u05D9 \u05E2\u05E1\u05E7"), /*#__PURE__*/React.createElement("h2", {
    style: {
      fontFamily: 'var(--font-headline)',
      fontWeight: 900,
      fontSize: 'clamp(36px, 5vw, 68px)',
      lineHeight: 1,
      margin: '0 0 20px'
    }
  }, "\u05D9\u05E9 \u05DC\u05DA \u05D1\u05D9\u05EA \u05E2\u05E1\u05E7?", /*#__PURE__*/React.createElement("br", null), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-english)',
      fontStyle: 'italic',
      fontWeight: 600,
      color: '#EAF3DE'
    }
  }, "\u05D1\u05D5\u05D0\u05D9 \u05D0\u05DC\u05D9\u05E0\u05D5.")), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 18,
      lineHeight: 1.6,
      color: 'rgba(234,243,222,0.9)',
      maxWidth: 520,
      margin: '0 auto 32px'
    }
  }, "\u05D7\u05D9\u05E0\u05DD, \u05DC\u05EA\u05DE\u05D9\u05D3. \u05D1\u05DC\u05D9 \u05E2\u05DE\u05DC\u05D5\u05EA. \u05D1\u05DC\u05D9 \u05DE\u05EA\u05D5\u05D5\u05DB\u05D9\u05DD. \u05D0\u05EA \u05DE\u05D3\u05D1\u05E8\u05EA \u05D9\u05E9\u05E8 \u05E2\u05DD \u05D4\u05DC\u05E7\u05D5\u05D7\u05D5\u05EA \u05E9\u05DC\u05DA \u05D1\u05D5\u05D5\u05D0\u05D8\u05E1\u05D0\u05E4 \u2014 \u05D0\u05E0\u05D7\u05E0\u05D5 \u05E8\u05E7 \u05D3\u05D5\u05D0\u05D2\u05D5\u05EA \u05E9\u05D9\u05DE\u05E6\u05D0\u05D5 \u05D0\u05D5\u05EA\u05DA."), /*#__PURE__*/React.createElement("button", {
    style: {
      background: 'var(--background)',
      color: 'var(--primary-dark)',
      border: 'none',
      padding: '16px 28px',
      borderRadius: 'var(--radius-md)',
      fontSize: 16,
      fontWeight: 600,
      cursor: 'pointer'
    }
  }, "\u05D4\u05D5\u05E1\u05D9\u05E4\u05D9 \u05D0\u05EA \u05D4\u05E2\u05E1\u05E7 \u05E9\u05DC\u05DA"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'center',
      gap: 32,
      marginTop: 40,
      flexWrap: 'wrap',
      fontSize: 14,
      color: 'rgba(234,243,222,0.8)'
    }
  }, /*#__PURE__*/React.createElement("span", null, "\u2713 \u05D7\u05D9\u05E0\u05DD \u05DC\u05D1\u05EA\u05D9 \u05E2\u05E1\u05E7"), /*#__PURE__*/React.createElement("span", null, "\u2713 \u05DC\u05DC\u05D0 \u05E2\u05DE\u05DC\u05D5\u05EA"), /*#__PURE__*/React.createElement("span", null, "\u2713 WhatsApp \u05D9\u05E9\u05D9\u05E8"))));
}
function Footer() {
  return /*#__PURE__*/React.createElement("footer", {
    style: {
      background: 'var(--primary-dark)',
      color: '#EAF3DE',
      padding: '80px 16px 24px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 'var(--container-max)',
      margin: '0 auto'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 16,
      paddingBottom: 48,
      borderBottom: '1px solid rgba(255,255,255,0.1)',
      textAlign: 'center'
    }
  }, /*#__PURE__*/React.createElement("h2", {
    style: {
      fontFamily: 'var(--font-headline)',
      fontWeight: 900,
      fontSize: 'clamp(56px, 10vw, 120px)',
      lineHeight: 0.9,
      margin: 0,
      color: '#fff',
      letterSpacing: '-0.03em'
    }
  }, "\u05DE", /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-english)',
      fontStyle: 'italic',
      fontWeight: 600,
      color: 'var(--accent-warm-light)'
    }
  }, "\u05D4"), "\u05DE\u05E7\u05D5\u05E8"), /*#__PURE__*/React.createElement("p", {
    style: {
      fontFamily: 'var(--font-headline)',
      fontStyle: 'italic',
      fontSize: 22,
      color: 'rgba(234,243,222,0.9)',
      margin: 0
    }
  }, "\u05D0\u05D5\u05DB\u05DC \u05D0\u05DE\u05D9\u05EA\u05D9, \u05DE\u05D0\u05E0\u05E9\u05D9\u05DD \u05D0\u05DE\u05D9\u05EA\u05D9\u05D9\u05DD.")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1.5fr 1fr 1fr',
      gap: 40,
      padding: '40px 0',
      borderBottom: '1px solid rgba(255,255,255,0.1)'
    },
    className: "footer-grid"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 14,
      color: 'rgba(234,243,222,0.85)',
      lineHeight: 1.7,
      margin: '0 0 16px',
      maxWidth: 360
    }
  }, "\u05EA\u05D9\u05D1\u05EA \u05D3\u05D5\u05D0\u05E8 \u05E9\u05D1\u05D5\u05E2\u05D9\u05EA: \u05D1\u05D9\u05EA \u05E2\u05E1\u05E7 \u05D7\u05D3\u05E9, \u05DE\u05EA\u05DB\u05D5\u05DF \u05E2\u05D5\u05E0\u05EA\u05D9, \u05D5\u05E9\u05D9\u05D7\u05D4 \u05E2\u05DD \u05D0\u05D7\u05EA \u05D4\u05E9\u05DB\u05E0\u05D5\u05EA."), /*#__PURE__*/React.createElement("form", {
    onSubmit: e => e.preventDefault(),
    style: {
      display: 'flex',
      gap: 8,
      maxWidth: 360
    }
  }, /*#__PURE__*/React.createElement("input", {
    type: "email",
    dir: "ltr",
    placeholder: "your@email.com",
    style: {
      flex: 1,
      background: 'transparent',
      border: '1px solid rgba(255,255,255,0.3)',
      color: '#fff',
      padding: '12px 14px',
      borderRadius: 'var(--radius-sm)',
      outline: 'none',
      fontSize: 14,
      fontFamily: 'var(--font-body)'
    }
  }), /*#__PURE__*/React.createElement("button", {
    type: "submit",
    style: {
      background: 'var(--background)',
      color: 'var(--primary-dark)',
      border: 'none',
      padding: '12px 20px',
      borderRadius: 'var(--radius-sm)',
      fontWeight: 600,
      cursor: 'pointer',
      fontSize: 14
    }
  }, "\u05D4\u05E8\u05E9\u05DE\u05D4"))), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 14,
      display: 'flex',
      flexDirection: 'column',
      gap: 10
    }
  }, /*#__PURE__*/React.createElement("a", {
    href: "#",
    style: {
      color: 'rgba(234,243,222,0.85)',
      textDecoration: 'none'
    }
  }, "\u05DC\u05D2\u05DC\u05D5\u05EA"), /*#__PURE__*/React.createElement("a", {
    href: "#",
    style: {
      color: 'rgba(234,243,222,0.85)',
      textDecoration: 'none'
    }
  }, "\u05DE\u05E4\u05D4"), /*#__PURE__*/React.createElement("a", {
    href: "#",
    style: {
      color: 'rgba(234,243,222,0.85)',
      textDecoration: 'none'
    }
  }, "\u05D0\u05D9\u05E8\u05D5\u05E2\u05D9\u05DD"), /*#__PURE__*/React.createElement("a", {
    href: "#",
    style: {
      color: 'rgba(234,243,222,0.85)',
      textDecoration: 'none'
    }
  }, "\u05E2\u05DC\u05D9\u05E0\u05D5")), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 14,
      display: 'flex',
      flexDirection: 'column',
      gap: 10
    }
  }, /*#__PURE__*/React.createElement("a", {
    href: "#",
    style: {
      color: 'rgba(234,243,222,0.85)',
      textDecoration: 'none'
    }
  }, "\u05D4\u05D5\u05E1\u05D9\u05E4\u05D9 \u05E2\u05E1\u05E7"), /*#__PURE__*/React.createElement("a", {
    href: "#",
    style: {
      color: 'rgba(234,243,222,0.85)',
      textDecoration: 'none'
    }
  }, "\u05DB\u05E0\u05D9\u05E1\u05D4"), /*#__PURE__*/React.createElement("a", {
    href: "#",
    style: {
      color: 'rgba(234,243,222,0.85)',
      textDecoration: 'none'
    }
  }, "\u05EA\u05E0\u05D0\u05D9\u05DD \xB7 \u05E4\u05E8\u05D8\u05D9\u05D5\u05EA"), /*#__PURE__*/React.createElement("a", {
    href: "#",
    style: {
      color: 'rgba(234,243,222,0.85)',
      textDecoration: 'none'
    }
  }, "@meha_makor on Instagram \u2197"))), /*#__PURE__*/React.createElement("div", {
    style: {
      paddingTop: 20,
      display: 'flex',
      justifyContent: 'space-between',
      fontSize: 12,
      color: 'rgba(234,243,222,0.6)',
      flexWrap: 'wrap',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("span", null, "\xA9 2026 \u05DE\u05D4\u05DE\u05E7\u05D5\u05E8 \u2014 \u05D9\u05E9\u05E8 \u05DE\u05D4\u05DE\u05E7\u05D5\u05E8"), /*#__PURE__*/React.createElement("span", null, "\u05E2\u05E9\u05D5\u05D9 \u05D1\u05D0\u05D4\u05D1\u05D4 \u05D1\u05D9\u05E9\u05E8\u05D0\u05DC \uD83C\uDDEE\uD83C\uDDF1"))), /*#__PURE__*/React.createElement("style", null, `@media (max-width: 720px) { .footer-grid { grid-template-columns: 1fr !important; gap: 32px !important; } }`));
}
function BottomNav({
  current = 'discover',
  onNav
}) {
  const tabs = [{
    k: 'discover',
    l: 'גלי',
    Icon: IconHouse
  }, {
    k: 'map',
    l: 'מפה',
    Icon: IconMap
  }, {
    k: 'neighbor',
    l: 'מהשכן',
    Icon: IconPot
  }, {
    k: 'favorites',
    l: 'שמורים',
    Icon: IconHeart
  }];
  return /*#__PURE__*/React.createElement("nav", {
    style: {
      position: 'sticky',
      bottom: 0,
      insetInline: 0,
      background: '#fff',
      borderTop: '1px solid var(--border)',
      boxShadow: '0 -2px 8px rgba(0,0,0,0.04)',
      zIndex: 40
    }
  }, /*#__PURE__*/React.createElement("ul", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(4, 1fr)',
      margin: 0,
      padding: 0,
      listStyle: 'none'
    }
  }, tabs.map(t => {
    const active = t.k === current;
    return /*#__PURE__*/React.createElement("li", {
      key: t.k
    }, /*#__PURE__*/React.createElement("a", {
      href: "#",
      onClick: e => {
        e.preventDefault();
        onNav?.(t.k);
      },
      style: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
        padding: '10px 4px 12px',
        color: active ? 'var(--primary)' : 'var(--fg-muted)',
        textDecoration: 'none',
        fontSize: 11,
        fontWeight: 500,
        minHeight: 56
      }
    }, /*#__PURE__*/React.createElement(t.Icon, {
      size: 22,
      fill: active ? 'var(--primary)' : 'none',
      stroke: active ? 'var(--primary)' : 'currentColor'
    }), /*#__PURE__*/React.createElement("span", null, t.l), active && /*#__PURE__*/React.createElement("span", {
      style: {
        width: 20,
        height: 2,
        background: 'var(--primary)',
        borderRadius: 2
      }
    })));
  })));
}
window.HowItWorks = HowItWorks;
window.FeaturedProducer = FeaturedProducer;
window.BusinessCTA = BusinessCTA;
window.Footer = Footer;
window.BottomNav = BottomNav;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/website/Sections.jsx", error: String((e && e.message) || e) }); }

// ui_kits/website/icons.jsx
try { (() => {
// Shared inline-SVG icons + brand glyphs. Pure JSX — no external deps.
const {
  createElement: h
} = React;

// Phosphor-style duotone substitutions (hand-tuned, single-path)
const IconLeaf = ({
  size = 20,
  stroke = "currentColor",
  fill = "none"
}) => /*#__PURE__*/React.createElement("svg", {
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: fill,
  stroke: stroke,
  strokeWidth: "1.5",
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": "true"
}, /*#__PURE__*/React.createElement("path", {
  d: "M11 20A7 7 0 019.8 6.1C15.5 5 17 4.48 19.2 2.96c1.4 9.3-2.5 14.48-8.2 17.04z"
}), /*#__PURE__*/React.createElement("path", {
  d: "M2 21c0-3 1.85-5.36 5.08-6"
}));
const IconHeart = ({
  size = 20,
  stroke = "currentColor",
  fill = "none"
}) => /*#__PURE__*/React.createElement("svg", {
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: fill,
  stroke: stroke,
  strokeWidth: "1.8",
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": "true"
}, /*#__PURE__*/React.createElement("path", {
  d: "M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 000-7.78z"
}));
const IconSeal = ({
  size = 14,
  fill = "currentColor"
}) => /*#__PURE__*/React.createElement("svg", {
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: fill,
  "aria-hidden": "true"
}, /*#__PURE__*/React.createElement("path", {
  d: "M12 2l2.5 2.2 3.3-.6.7 3.3L21 9l-1.5 3L21 15l-2.5 2.1-.7 3.3-3.3-.6L12 22l-2.5-2.2-3.3.6-.7-3.3L3 15l1.5-3L3 9l2.5-2.1.7-3.3 3.3.6L12 2zm-1 13l6-6-1.4-1.4L11 12.2l-2.6-2.6L7 11l4 4z"
}));
const IconHouse = ({
  size = 20,
  stroke = "currentColor",
  fill = "none"
}) => /*#__PURE__*/React.createElement("svg", {
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: fill,
  stroke: stroke,
  strokeWidth: "1.5",
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": "true"
}, /*#__PURE__*/React.createElement("path", {
  d: "M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1h-5v-7h-6v7H4a1 1 0 01-1-1V9.5z"
}));
const IconMap = ({
  size = 20,
  stroke = "currentColor",
  fill = "none"
}) => /*#__PURE__*/React.createElement("svg", {
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: fill,
  stroke: stroke,
  strokeWidth: "1.5",
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": "true"
}, /*#__PURE__*/React.createElement("path", {
  d: "M1 6v16l7-3 8 3 7-3V3l-7 3-8-3-7 3z"
}), /*#__PURE__*/React.createElement("path", {
  d: "M8 3v16M16 6v16"
}));
const IconCalendar = ({
  size = 20,
  stroke = "currentColor"
}) => /*#__PURE__*/React.createElement("svg", {
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: stroke,
  strokeWidth: "1.5",
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": "true"
}, /*#__PURE__*/React.createElement("rect", {
  x: "3",
  y: "4",
  width: "18",
  height: "18",
  rx: "2"
}), /*#__PURE__*/React.createElement("path", {
  d: "M16 2v4M8 2v4M3 10h18"
}));
const IconPot = ({
  size = 20,
  stroke = "currentColor"
}) => /*#__PURE__*/React.createElement("svg", {
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: stroke,
  strokeWidth: "1.5",
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": "true"
}, /*#__PURE__*/React.createElement("path", {
  d: "M3 10h18v4a6 6 0 01-6 6H9a6 6 0 01-6-6v-4z"
}), /*#__PURE__*/React.createElement("path", {
  d: "M5 10V8h14v2"
}), /*#__PURE__*/React.createElement("path", {
  d: "M10 4c0-1 .5-2 2-2s2 1 2 2"
}));
const IconCrosshair = ({
  size = 18,
  stroke = "currentColor"
}) => /*#__PURE__*/React.createElement("svg", {
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: stroke,
  strokeWidth: "2",
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": "true"
}, /*#__PURE__*/React.createElement("circle", {
  cx: "12",
  cy: "12",
  r: "9"
}), /*#__PURE__*/React.createElement("circle", {
  cx: "12",
  cy: "12",
  r: "3"
}), /*#__PURE__*/React.createElement("path", {
  d: "M12 2v4M12 18v4M2 12h4M18 12h4"
}));
const IconSearch = ({
  size = 18,
  stroke = "currentColor"
}) => /*#__PURE__*/React.createElement("svg", {
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: stroke,
  strokeWidth: "2",
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": "true"
}, /*#__PURE__*/React.createElement("circle", {
  cx: "11",
  cy: "11",
  r: "7"
}), /*#__PURE__*/React.createElement("path", {
  d: "m21 21-4.35-4.35"
}));
const IconMenu = ({
  size = 22,
  stroke = "currentColor"
}) => /*#__PURE__*/React.createElement("svg", {
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: stroke,
  strokeWidth: "2",
  strokeLinecap: "round",
  "aria-hidden": "true"
}, /*#__PURE__*/React.createElement("path", {
  d: "M4 6h16M4 12h16M4 18h16"
}));
const IconInstagram = ({
  size = 18,
  stroke = "currentColor"
}) => /*#__PURE__*/React.createElement("svg", {
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: stroke,
  strokeWidth: "2",
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": "true"
}, /*#__PURE__*/React.createElement("rect", {
  x: "2",
  y: "2",
  width: "20",
  height: "20",
  rx: "5"
}), /*#__PURE__*/React.createElement("path", {
  d: "M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"
}), /*#__PURE__*/React.createElement("line", {
  x1: "17.5",
  y1: "6.5",
  x2: "17.51",
  y2: "6.5"
}));
const IconPhone = ({
  size = 18,
  stroke = "currentColor"
}) => /*#__PURE__*/React.createElement("svg", {
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: stroke,
  strokeWidth: "2",
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": "true"
}, /*#__PURE__*/React.createElement("path", {
  d: "M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"
}));
const IconWhatsApp = ({
  size = 18,
  fill = "currentColor"
}) => /*#__PURE__*/React.createElement("svg", {
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: fill,
  "aria-hidden": "true"
}, /*#__PURE__*/React.createElement("path", {
  d: "M20.52 3.48A11.9 11.9 0 0012.04 0C5.45 0 .1 5.35.1 11.94c0 2.1.55 4.15 1.6 5.96L0 24l6.27-1.64a11.9 11.9 0 005.77 1.47h.01c6.59 0 11.94-5.35 11.94-11.94 0-3.19-1.24-6.19-3.47-8.41zm-3.05 10.94c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15s-.77.97-.94 1.17c-.17.2-.35.22-.65.07-.3-.15-1.25-.46-2.38-1.47-.88-.78-1.47-1.75-1.65-2.04-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.07-.15-.67-1.61-.92-2.2-.24-.58-.49-.5-.67-.51l-.57-.01c-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.48 0 1.46 1.07 2.88 1.22 3.08.15.2 2.1 3.2 5.08 4.49.71.3 1.26.49 1.69.63.71.22 1.36.19 1.87.12.57-.09 1.76-.72 2-1.41.25-.7.25-1.29.17-1.41-.07-.12-.27-.2-.57-.34z"
}));

// Hand-drawn category line-art (copied from CategoryIcons.jsx)
const CategoryLineArt = ({
  type = "veg",
  size = 64,
  stroke = "#2e6853",
  strokeWidth = 1.5
}) => {
  const paths = {
    meat: /*#__PURE__*/React.createElement("g", null, /*#__PURE__*/React.createElement("path", {
      d: "M12 44 C12 44 8 36 14 28 C20 20 32 18 38 22 C44 26 46 34 42 40 C38 46 28 48 20 46 Z"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M38 22 L52 10"
    }), /*#__PURE__*/React.createElement("circle", {
      cx: "50",
      cy: "12",
      r: "4"
    })),
    veg: /*#__PURE__*/React.createElement("g", null, /*#__PURE__*/React.createElement("path", {
      d: "M32 52 L32 20"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M32 20 C32 20 18 16 14 28 C18 28 26 26 32 32"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M32 28 C32 28 44 20 50 30 C46 32 38 30 32 36"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M28 44 L20 50"
    })),
    dairy: /*#__PURE__*/React.createElement("g", null, /*#__PURE__*/React.createElement("path", {
      d: "M24 16 L24 12 C24 10 26 8 28 8 L36 8 C38 8 40 10 40 12 L40 16"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M20 16 L20 52 C20 54 22 56 24 56 L40 56 C42 56 44 54 44 52 L44 16 Z"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M20 26 L44 26"
    })),
    bread: /*#__PURE__*/React.createElement("g", null, /*#__PURE__*/React.createElement("path", {
      d: "M14 40 C14 40 12 32 18 26 C24 20 40 20 46 26 C52 32 50 40 50 40 Z"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M14 40 L14 48 C14 50 16 52 18 52 L46 52 C48 52 50 50 50 48 L50 40"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M24 20 C24 16 22 14 24 10"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M32 20 C32 14 30 12 32 8"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M40 20 C40 16 38 14 40 10"
    })),
    oil: /*#__PURE__*/React.createElement("g", null, /*#__PURE__*/React.createElement("path", {
      d: "M22 24 L22 52 C22 54 24 56 26 56 L38 56 C40 56 42 54 42 52 L42 24 Z"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M20 24 L44 24"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M28 36 C30 32 34 32 36 36 C38 40 36 46 32 46 C28 46 26 40 28 36 Z"
    })),
    care: /*#__PURE__*/React.createElement("g", null, /*#__PURE__*/React.createElement("rect", {
      x: "18",
      y: "28",
      width: "28",
      height: "24",
      rx: "4"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M22 28 L22 22 C22 20 24 18 26 18 L38 18 C40 18 42 20 42 22 L42 28"
    }), /*#__PURE__*/React.createElement("circle", {
      cx: "26",
      cy: "16",
      r: "3"
    }), /*#__PURE__*/React.createElement("circle", {
      cx: "34",
      cy: "12",
      r: "2"
    }))
  };
  return /*#__PURE__*/React.createElement("svg", {
    width: size,
    height: size,
    viewBox: "0 0 64 64",
    fill: "none",
    stroke: stroke,
    strokeWidth: strokeWidth,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": "true"
  }, paths[type] || paths.veg);
};
Object.assign(window, {
  IconLeaf,
  IconHeart,
  IconSeal,
  IconHouse,
  IconMap,
  IconCalendar,
  IconPot,
  IconCrosshair,
  IconSearch,
  IconMenu,
  IconInstagram,
  IconPhone,
  IconWhatsApp,
  CategoryLineArt
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/website/icons.jsx", error: String((e && e.message) || e) }); }

__ds_ns.MeatIcon = __ds_scope.MeatIcon;

__ds_ns.VegIcon = __ds_scope.VegIcon;

__ds_ns.DairyIcon = __ds_scope.DairyIcon;

__ds_ns.BreadIcon = __ds_scope.BreadIcon;

__ds_ns.OilIcon = __ds_scope.OilIcon;

__ds_ns.SoapIcon = __ds_scope.SoapIcon;

__ds_ns.CATEGORY_ICONS = __ds_scope.CATEGORY_ICONS;

__ds_ns.MapComponent = __ds_scope.MapComponent;

__ds_ns.CATEGORY_STYLES = __ds_scope.CATEGORY_STYLES;

__ds_ns.DEFAULT_CATEGORY_STYLE = __ds_scope.DEFAULT_CATEGORY_STYLE;

__ds_ns.CATEGORY_LEGEND = __ds_scope.CATEGORY_LEGEND;

__ds_ns.BottomNav = __ds_scope.BottomNav;

__ds_ns.Footer = __ds_scope.Footer;

__ds_ns.Header = __ds_scope.Header;

__ds_ns.ProducerCard = __ds_scope.ProducerCard;

__ds_ns.HomePage = __ds_scope.HomePage;

})();
