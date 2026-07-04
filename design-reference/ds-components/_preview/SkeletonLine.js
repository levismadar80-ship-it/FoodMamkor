var __dsPreview = (() => {
  var __create = Object.create;
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __getProtoOf = Object.getPrototypeOf;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __esm = (fn, res, err) => function __init() {
    if (err) throw err[0];
    try {
      return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
    } catch (e) {
      throw err = [e], e;
    }
  };
  var __commonJS = (cb, mod) => function __require() {
    try {
      return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
    } catch (e) {
      throw mod = 0, e;
    }
  };
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __reExport = (target, mod, secondTarget) => (__copyProps(target, mod, "default"), secondTarget && __copyProps(secondTarget, mod, "default"));
  var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
    // If the importer is in node compatibility mode or this is not an ESM
    // file that has been converted to a CommonJS file using a Babel-
    // compatible transform (i.e. "__esModule" has not been set), then set
    // "default" to the CommonJS "module.exports" for node compatibility.
    isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
    mod
  ));
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // <define:import.meta.env>
  var init_define_import_meta_env = __esm({
    "<define:import.meta.env>"() {
    }
  });

  // ds-raw:__ds_raw__
  var require_ds_raw = __commonJS({
    "ds-raw:__ds_raw__"(exports, module) {
      init_define_import_meta_env();
      module.exports = window.MehamakorDS;
    }
  });

  // shim:react-shim
  var require_react_shim = __commonJS({
    "shim:react-shim"(exports, module) {
      init_define_import_meta_env();
      var R = window.React;
      function jsx2(t, p, k) {
        return R.createElement(t, k === void 0 ? p : Object.assign({ key: k }, p));
      }
      module.exports = R;
      module.exports.jsx = jsx2;
      module.exports.jsxs = jsx2;
      module.exports.jsxDEV = jsx2;
      module.exports.Fragment = R.Fragment;
    }
  });

  // .design-sync/previews/SkeletonLine.tsx
  var SkeletonLine_exports = {};
  __export(SkeletonLine_exports, {
    ParagraphLines: () => ParagraphLines,
    TitleAndMeta: () => TitleAndMeta
  });
  init_define_import_meta_env();

  // ds-shim:ds
  var ds_exports = {};
  __export(ds_exports, {
    default: () => ds_default
  });
  init_define_import_meta_env();
  __reExport(ds_exports, __toESM(require_ds_raw()));
  var g = window.MehamakorDS;
  var ds_default = "default" in g ? g.default : g;

  // .design-sync/previews/SkeletonLine.tsx
  var import_jsx_runtime = __toESM(require_react_shim());
  var SHIMMER_CSS = `
  .skeleton-box {
    background: linear-gradient(90deg, #e8e0d0 25%, #f5f0e8 50%, #e8e0d0 75%);
    background-size: 200% 100%;
    animation: shimmer 1.5s infinite ease-in-out;
  }
  @keyframes shimmer {
    0% { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }
`;
  function ParagraphLines() {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { width: 320, display: "flex", flexDirection: "column", gap: 10 }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("style", { children: SHIMMER_CSS }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.SkeletonLine, { width: "90%", height: "16px" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.SkeletonLine, { width: "100%" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.SkeletonLine, { width: "75%" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.SkeletonLine, { width: "60%" })
    ] });
  }
  function TitleAndMeta() {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { width: 280, display: "flex", flexDirection: "column", gap: 8 }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("style", { children: SHIMMER_CSS }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.SkeletonLine, { width: "70%", height: "22px" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.SkeletonLine, { width: "40%", height: "13px" })
    ] });
  }
  return __toCommonJS(SkeletonLine_exports);
})();
