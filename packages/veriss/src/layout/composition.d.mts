import type { LayoutIR, ContractIR } from '../layout-contract.mjs';
import type { LayoutDeclaration } from '../layout-contracts.d.ts';
interface Scenario {
    readonly variant?: number;
    readonly scrollbarProfile?: string;
}
interface ScenarioRow extends Scenario {
    readonly path?: string;
}
export interface LayoutInstance {
    path: string;
    declaration: Readonly<LayoutDeclaration>;
    contract: ContractIR;
    cases: Scenario[];
}
export declare const caseKey: (row: Scenario) => string;
export declare const boxKey: (row: ScenarioRow) => string;
export declare const descendant: (path: string, parent: string) => boolean;
/** Authored interfaces, never substitutes for implementation geometry. */
export declare function layoutInstances(implementation: LayoutIR): LayoutInstance[];
export declare function directInstances(instances: readonly LayoutInstance[], path: string, cases: readonly Scenario[]): {
    cases: Scenario[];
    path: string;
    declaration: Readonly<LayoutDeclaration>;
    contract: ContractIR;
}[];
/** Only the child's native root is visible to a caller's selectors/profile. */
export declare function localLayout(implementation: LayoutIR, boundaries: readonly LayoutInstance[]): {
    boxes: {
        readonly variant?: number;
        readonly scrollbarProfile?: string;
        readonly rect?: {
            readonly inlineStart: {
                readonly coefficient: string;
                readonly constant: string;
                readonly heightCoefficient?: string;
            };
            readonly blockStart: {
                readonly coefficient: string;
                readonly constant: string;
                readonly heightCoefficient?: string;
            };
            readonly inlineSize: {
                readonly coefficient: string;
                readonly constant: string;
                readonly heightCoefficient?: string;
            };
            readonly blockSize: {
                readonly coefficient: string;
                readonly constant: string;
                readonly heightCoefficient?: string;
            };
        };
        readonly position?: "static" | "relative" | "absolute";
        readonly origin?: {
            readonly inline: {
                readonly coefficient: string;
                readonly constant: string;
                readonly heightCoefficient?: string;
            };
            readonly block: {
                readonly coefficient: string;
                readonly constant: string;
                readonly heightCoefficient?: string;
            };
        };
        readonly containingBlock?: {
            readonly path: string;
            readonly inline: {
                readonly coefficient: string;
                readonly constant: string;
                readonly heightCoefficient?: string;
            };
            readonly block: {
                readonly coefficient: string;
                readonly constant: string;
                readonly heightCoefficient?: string;
            };
        };
        readonly box: string;
        readonly path: string;
        readonly range: {
            readonly min: number;
            readonly max: number;
            readonly minInclusive: boolean;
            readonly maxInclusive: boolean;
            readonly minExact: string;
            readonly maxExact: string;
        };
        readonly heightRange?: {
            readonly min: number;
            readonly max: number;
            readonly minInclusive: boolean;
            readonly maxInclusive: boolean;
            readonly minExact: string;
            readonly maxExact: string;
        };
        readonly region?: {
            readonly vertices: readonly {
                readonly width: string;
                readonly height: string;
            }[];
            readonly constraints: readonly {
                readonly coefficient: string;
                readonly constant: string;
                readonly heightCoefficient?: string;
                readonly strict: boolean;
            }[];
        } | undefined;
        readonly boxSizing: "border-box" | "content-box";
        readonly allocated: {
            readonly inline: {
                readonly coefficient: string;
                readonly constant: string;
                readonly heightCoefficient?: string;
            };
            readonly block?: {
                readonly coefficient: string;
                readonly constant: string;
                readonly heightCoefficient?: string;
            };
        };
        readonly border: {
            readonly inline: {
                readonly coefficient: string;
                readonly constant: string;
                readonly heightCoefficient?: string;
            };
            readonly block?: {
                readonly coefficient: string;
                readonly constant: string;
                readonly heightCoefficient?: string;
            };
        };
        readonly content: {
            readonly inline: {
                readonly coefficient: string;
                readonly constant: string;
                readonly heightCoefficient?: string;
            };
            readonly block?: {
                readonly coefficient: string;
                readonly constant: string;
                readonly heightCoefficient?: string;
            };
        };
        readonly padding?: {
            readonly inline: {
                readonly coefficient: string;
                readonly constant: string;
                readonly heightCoefficient?: string;
            };
            readonly block?: {
                readonly coefficient: string;
                readonly constant: string;
                readonly heightCoefficient?: string;
            };
        };
    }[];
    elements: {
        readonly path: string;
        readonly tag: string;
        readonly id?: string;
        readonly classes: readonly string[];
        readonly owner: string;
        readonly targets?: readonly string[];
        readonly targetIdentity?: "stable" | "unknown";
        readonly variant?: number;
        readonly scrollbarProfile?: string;
    }[];
    version: 1;
    kind: "layout";
    component: string;
    scope: {
        readonly mediaFeatures?: {
            readonly hover?: "none" | "hover";
            readonly pointer?: "none" | "coarse" | "fine";
            readonly 'prefers-reduced-motion'?: "no-preference" | "reduce";
        };
        readonly axis: "inline" | "both";
        readonly viewport: {
            readonly min: number;
            readonly max: number;
            readonly minInclusive: boolean;
            readonly maxInclusive: boolean;
            readonly minExact: string;
            readonly maxExact: string;
            readonly height?: {
                readonly min: number;
                readonly max: number;
                readonly minInclusive: boolean;
                readonly maxInclusive: boolean;
                readonly minExact: string;
                readonly maxExact: string;
            } | null;
        };
        readonly hostInset: number;
        readonly hostBlockInset?: number;
        readonly closedCSS: true;
        readonly browserRounding: false;
        readonly blockSizing: boolean;
        readonly scrollbarProfiles?: readonly {
            readonly name: string;
            readonly inlineSize: number;
            readonly blockSize: number;
            readonly thinInlineSize?: number;
            readonly thinBlockSize?: number;
        }[];
    };
    cases: readonly {
        readonly variant?: number;
        readonly scrollbarProfile?: string;
    }[];
    presence: readonly {
        readonly variant?: number;
        readonly scrollbarProfile?: string;
        readonly box: string;
        readonly path: string;
        readonly axis: "inline" | "block";
        readonly overflow: "fit" | "scroll" | "clip" | "visible";
        readonly range: {
            readonly min: number;
            readonly max: number;
            readonly minInclusive: boolean;
            readonly maxInclusive: boolean;
            readonly minExact: string;
            readonly maxExact: string;
        };
        readonly heightRange?: {
            readonly min: number;
            readonly max: number;
            readonly minInclusive: boolean;
            readonly maxInclusive: boolean;
            readonly minExact: string;
            readonly maxExact: string;
        };
        readonly region?: {
            readonly vertices: readonly {
                readonly width: string;
                readonly height: string;
            }[];
            readonly constraints: readonly {
                readonly coefficient: string;
                readonly constant: string;
                readonly heightCoefficient?: string;
                readonly strict: boolean;
            }[];
        };
    }[];
    checks: readonly {
        readonly variant?: number;
        readonly scrollbarProfile?: string;
        readonly box: string;
        readonly path: string;
        readonly code: string;
        readonly axis: "inline" | "block";
        readonly range: {
            readonly min: number;
            readonly max: number;
            readonly minInclusive: boolean;
            readonly maxInclusive: boolean;
            readonly minExact: string;
            readonly maxExact: string;
        };
        readonly heightRange?: {
            readonly min: number;
            readonly max: number;
            readonly minInclusive: boolean;
            readonly maxInclusive: boolean;
            readonly minExact: string;
            readonly maxExact: string;
        };
        readonly region?: {
            readonly vertices: readonly {
                readonly width: string;
                readonly height: string;
            }[];
            readonly constraints: readonly {
                readonly coefficient: string;
                readonly constant: string;
                readonly heightCoefficient?: string;
                readonly strict: boolean;
            }[];
        };
        readonly available: {
            readonly coefficient: string;
            readonly constant: string;
            readonly heightCoefficient?: string;
        };
        readonly required: {
            readonly coefficient: string;
            readonly constant: string;
            readonly heightCoefficient?: string;
        };
        readonly enforced: boolean;
    }[];
    errors: readonly {
        readonly variant?: number;
        readonly scrollbarProfile?: string;
        readonly code: string;
        readonly severity: "error" | "unknown";
        readonly message: string;
        readonly box?: string;
        readonly path?: string;
        readonly range?: {
            readonly min: number;
            readonly max: number;
            readonly minInclusive: boolean;
            readonly maxInclusive: boolean;
            readonly minExact: string;
            readonly maxExact: string;
        };
        readonly axis?: "inline" | "block";
        readonly heightRange?: {
            readonly min: number;
            readonly max: number;
            readonly minInclusive: boolean;
            readonly maxInclusive: boolean;
            readonly minExact: string;
            readonly maxExact: string;
        };
        readonly region?: {
            readonly vertices: readonly {
                readonly width: string;
                readonly height: string;
            }[];
            readonly constraints: readonly {
                readonly coefficient: string;
                readonly constant: string;
                readonly heightCoefficient?: string;
                readonly strict: boolean;
            }[];
        };
        readonly css?: {
            readonly file: string;
            readonly line: number;
            readonly column?: number;
        };
        readonly hint?: string;
        readonly related?: readonly {
            readonly message: string;
            readonly css: {
                readonly file: string;
                readonly line: number;
                readonly column?: number;
            };
        }[];
        readonly conflict?: {
            readonly properties: readonly [string, string];
            readonly longhands: readonly string[];
        };
        readonly source?: {
            readonly start: number;
            readonly end: number;
        };
        readonly witness?: {
            readonly viewport: number;
            readonly viewportExact: string;
            readonly viewportHeight?: number;
            readonly viewportHeightExact?: string;
            readonly available: number;
            readonly required: number;
        };
        readonly text?: {
            readonly maxLength: number;
            readonly fitsUpTo: number;
            readonly widest: string;
        } | {
            readonly lines: number;
            readonly fitsLines: number;
        };
        readonly explanation?: {
            readonly version: 1;
            readonly available: {
                readonly facts: readonly ({
                    readonly path: string;
                    readonly box: string;
                    readonly owner: string;
                    readonly property: string;
                    readonly value: string;
                    readonly origin: "author";
                    readonly css: {
                        readonly file: string;
                        readonly line: number;
                        readonly selector: string;
                        readonly layer?: string;
                        readonly specified: string;
                        readonly conditions?: readonly {
                            readonly kind: "media" | "container";
                            readonly name?: string;
                            readonly params: string;
                            readonly css: {
                                readonly file: string;
                                readonly line: number;
                            };
                        }[];
                    };
                    readonly overridden?: readonly {
                        readonly css: {
                            readonly file: string;
                            readonly line: number;
                            readonly selector: string;
                            readonly layer?: string;
                            readonly specified: string;
                            readonly conditions?: readonly {
                                readonly kind: "media" | "container";
                                readonly name?: string;
                                readonly params: string;
                                readonly css: {
                                    readonly file: string;
                                    readonly line: number;
                                };
                            }[];
                        };
                    }[];
                    readonly dormant?: readonly {
                        readonly css: {
                            readonly file: string;
                            readonly line: number;
                            readonly selector: string;
                            readonly layer?: string;
                            readonly specified: string;
                            readonly conditions?: readonly {
                                readonly kind: "media" | "container";
                                readonly name?: string;
                                readonly params: string;
                                readonly css: {
                                    readonly file: string;
                                    readonly line: number;
                                };
                            }[];
                        };
                    }[];
                } | {
                    readonly path: string;
                    readonly box: string;
                    readonly owner: string;
                    readonly property: string;
                    readonly value: string;
                    readonly origin: "default";
                    readonly overridden?: readonly {
                        readonly css: {
                            readonly file: string;
                            readonly line: number;
                            readonly selector: string;
                            readonly layer?: string;
                            readonly specified: string;
                            readonly conditions?: readonly {
                                readonly kind: "media" | "container";
                                readonly name?: string;
                                readonly params: string;
                                readonly css: {
                                    readonly file: string;
                                    readonly line: number;
                                };
                            }[];
                        };
                    }[];
                    readonly dormant?: readonly {
                        readonly css: {
                            readonly file: string;
                            readonly line: number;
                            readonly selector: string;
                            readonly layer?: string;
                            readonly specified: string;
                            readonly conditions?: readonly {
                                readonly kind: "media" | "container";
                                readonly name?: string;
                                readonly params: string;
                                readonly css: {
                                    readonly file: string;
                                    readonly line: number;
                                };
                            }[];
                        };
                    }[];
                } | {
                    readonly kind: "viewport";
                    readonly axis: "inline" | "block";
                    readonly hostInset?: number;
                } | {
                    readonly kind: "contract";
                    readonly path: string;
                    readonly box: string;
                    readonly owner: string;
                    readonly property: "minInlineSize" | "minBlockSize";
                    readonly value: number;
                    readonly selector: string;
                    readonly trusted: true;
                })[];
            };
            readonly required: {
                readonly facts: readonly ({
                    readonly path: string;
                    readonly box: string;
                    readonly owner: string;
                    readonly property: string;
                    readonly value: string;
                    readonly origin: "author";
                    readonly css: {
                        readonly file: string;
                        readonly line: number;
                        readonly selector: string;
                        readonly layer?: string;
                        readonly specified: string;
                        readonly conditions?: readonly {
                            readonly kind: "media" | "container";
                            readonly name?: string;
                            readonly params: string;
                            readonly css: {
                                readonly file: string;
                                readonly line: number;
                            };
                        }[];
                    };
                    readonly overridden?: readonly {
                        readonly css: {
                            readonly file: string;
                            readonly line: number;
                            readonly selector: string;
                            readonly layer?: string;
                            readonly specified: string;
                            readonly conditions?: readonly {
                                readonly kind: "media" | "container";
                                readonly name?: string;
                                readonly params: string;
                                readonly css: {
                                    readonly file: string;
                                    readonly line: number;
                                };
                            }[];
                        };
                    }[];
                    readonly dormant?: readonly {
                        readonly css: {
                            readonly file: string;
                            readonly line: number;
                            readonly selector: string;
                            readonly layer?: string;
                            readonly specified: string;
                            readonly conditions?: readonly {
                                readonly kind: "media" | "container";
                                readonly name?: string;
                                readonly params: string;
                                readonly css: {
                                    readonly file: string;
                                    readonly line: number;
                                };
                            }[];
                        };
                    }[];
                } | {
                    readonly path: string;
                    readonly box: string;
                    readonly owner: string;
                    readonly property: string;
                    readonly value: string;
                    readonly origin: "default";
                    readonly overridden?: readonly {
                        readonly css: {
                            readonly file: string;
                            readonly line: number;
                            readonly selector: string;
                            readonly layer?: string;
                            readonly specified: string;
                            readonly conditions?: readonly {
                                readonly kind: "media" | "container";
                                readonly name?: string;
                                readonly params: string;
                                readonly css: {
                                    readonly file: string;
                                    readonly line: number;
                                };
                            }[];
                        };
                    }[];
                    readonly dormant?: readonly {
                        readonly css: {
                            readonly file: string;
                            readonly line: number;
                            readonly selector: string;
                            readonly layer?: string;
                            readonly specified: string;
                            readonly conditions?: readonly {
                                readonly kind: "media" | "container";
                                readonly name?: string;
                                readonly params: string;
                                readonly css: {
                                    readonly file: string;
                                    readonly line: number;
                                };
                            }[];
                        };
                    }[];
                } | {
                    readonly kind: "viewport";
                    readonly axis: "inline" | "block";
                    readonly hostInset?: number;
                } | {
                    readonly kind: "contract";
                    readonly path: string;
                    readonly box: string;
                    readonly owner: string;
                    readonly property: "minInlineSize" | "minBlockSize";
                    readonly value: number;
                    readonly selector: string;
                    readonly trusted: true;
                })[];
            };
        };
    }[];
    diagnostics: readonly {
        readonly variant?: number;
        readonly scrollbarProfile?: string;
        readonly code: string;
        readonly severity: "error" | "unknown";
        readonly message: string;
        readonly box?: string;
        readonly path?: string;
        readonly range?: {
            readonly min: number;
            readonly max: number;
            readonly minInclusive: boolean;
            readonly maxInclusive: boolean;
            readonly minExact: string;
            readonly maxExact: string;
        };
        readonly axis?: "inline" | "block";
        readonly heightRange?: {
            readonly min: number;
            readonly max: number;
            readonly minInclusive: boolean;
            readonly maxInclusive: boolean;
            readonly minExact: string;
            readonly maxExact: string;
        };
        readonly region?: {
            readonly vertices: readonly {
                readonly width: string;
                readonly height: string;
            }[];
            readonly constraints: readonly {
                readonly coefficient: string;
                readonly constant: string;
                readonly heightCoefficient?: string;
                readonly strict: boolean;
            }[];
        };
        readonly css?: {
            readonly file: string;
            readonly line: number;
            readonly column?: number;
        };
        readonly hint?: string;
        readonly related?: readonly {
            readonly message: string;
            readonly css: {
                readonly file: string;
                readonly line: number;
                readonly column?: number;
            };
        }[];
        readonly conflict?: {
            readonly properties: readonly [string, string];
            readonly longhands: readonly string[];
        };
        readonly source?: {
            readonly start: number;
            readonly end: number;
        };
        readonly witness?: {
            readonly viewport: number;
            readonly viewportExact: string;
            readonly viewportHeight?: number;
            readonly viewportHeightExact?: string;
            readonly available: number;
            readonly required: number;
        };
        readonly text?: {
            readonly maxLength: number;
            readonly fitsUpTo: number;
            readonly widest: string;
        } | {
            readonly lines: number;
            readonly fitsLines: number;
        };
        readonly explanation?: {
            readonly version: 1;
            readonly available: {
                readonly facts: readonly ({
                    readonly path: string;
                    readonly box: string;
                    readonly owner: string;
                    readonly property: string;
                    readonly value: string;
                    readonly origin: "author";
                    readonly css: {
                        readonly file: string;
                        readonly line: number;
                        readonly selector: string;
                        readonly layer?: string;
                        readonly specified: string;
                        readonly conditions?: readonly {
                            readonly kind: "media" | "container";
                            readonly name?: string;
                            readonly params: string;
                            readonly css: {
                                readonly file: string;
                                readonly line: number;
                            };
                        }[];
                    };
                    readonly overridden?: readonly {
                        readonly css: {
                            readonly file: string;
                            readonly line: number;
                            readonly selector: string;
                            readonly layer?: string;
                            readonly specified: string;
                            readonly conditions?: readonly {
                                readonly kind: "media" | "container";
                                readonly name?: string;
                                readonly params: string;
                                readonly css: {
                                    readonly file: string;
                                    readonly line: number;
                                };
                            }[];
                        };
                    }[];
                    readonly dormant?: readonly {
                        readonly css: {
                            readonly file: string;
                            readonly line: number;
                            readonly selector: string;
                            readonly layer?: string;
                            readonly specified: string;
                            readonly conditions?: readonly {
                                readonly kind: "media" | "container";
                                readonly name?: string;
                                readonly params: string;
                                readonly css: {
                                    readonly file: string;
                                    readonly line: number;
                                };
                            }[];
                        };
                    }[];
                } | {
                    readonly path: string;
                    readonly box: string;
                    readonly owner: string;
                    readonly property: string;
                    readonly value: string;
                    readonly origin: "default";
                    readonly overridden?: readonly {
                        readonly css: {
                            readonly file: string;
                            readonly line: number;
                            readonly selector: string;
                            readonly layer?: string;
                            readonly specified: string;
                            readonly conditions?: readonly {
                                readonly kind: "media" | "container";
                                readonly name?: string;
                                readonly params: string;
                                readonly css: {
                                    readonly file: string;
                                    readonly line: number;
                                };
                            }[];
                        };
                    }[];
                    readonly dormant?: readonly {
                        readonly css: {
                            readonly file: string;
                            readonly line: number;
                            readonly selector: string;
                            readonly layer?: string;
                            readonly specified: string;
                            readonly conditions?: readonly {
                                readonly kind: "media" | "container";
                                readonly name?: string;
                                readonly params: string;
                                readonly css: {
                                    readonly file: string;
                                    readonly line: number;
                                };
                            }[];
                        };
                    }[];
                } | {
                    readonly kind: "viewport";
                    readonly axis: "inline" | "block";
                    readonly hostInset?: number;
                } | {
                    readonly kind: "contract";
                    readonly path: string;
                    readonly box: string;
                    readonly owner: string;
                    readonly property: "minInlineSize" | "minBlockSize";
                    readonly value: number;
                    readonly selector: string;
                    readonly trusted: true;
                })[];
            };
            readonly required: {
                readonly facts: readonly ({
                    readonly path: string;
                    readonly box: string;
                    readonly owner: string;
                    readonly property: string;
                    readonly value: string;
                    readonly origin: "author";
                    readonly css: {
                        readonly file: string;
                        readonly line: number;
                        readonly selector: string;
                        readonly layer?: string;
                        readonly specified: string;
                        readonly conditions?: readonly {
                            readonly kind: "media" | "container";
                            readonly name?: string;
                            readonly params: string;
                            readonly css: {
                                readonly file: string;
                                readonly line: number;
                            };
                        }[];
                    };
                    readonly overridden?: readonly {
                        readonly css: {
                            readonly file: string;
                            readonly line: number;
                            readonly selector: string;
                            readonly layer?: string;
                            readonly specified: string;
                            readonly conditions?: readonly {
                                readonly kind: "media" | "container";
                                readonly name?: string;
                                readonly params: string;
                                readonly css: {
                                    readonly file: string;
                                    readonly line: number;
                                };
                            }[];
                        };
                    }[];
                    readonly dormant?: readonly {
                        readonly css: {
                            readonly file: string;
                            readonly line: number;
                            readonly selector: string;
                            readonly layer?: string;
                            readonly specified: string;
                            readonly conditions?: readonly {
                                readonly kind: "media" | "container";
                                readonly name?: string;
                                readonly params: string;
                                readonly css: {
                                    readonly file: string;
                                    readonly line: number;
                                };
                            }[];
                        };
                    }[];
                } | {
                    readonly path: string;
                    readonly box: string;
                    readonly owner: string;
                    readonly property: string;
                    readonly value: string;
                    readonly origin: "default";
                    readonly overridden?: readonly {
                        readonly css: {
                            readonly file: string;
                            readonly line: number;
                            readonly selector: string;
                            readonly layer?: string;
                            readonly specified: string;
                            readonly conditions?: readonly {
                                readonly kind: "media" | "container";
                                readonly name?: string;
                                readonly params: string;
                                readonly css: {
                                    readonly file: string;
                                    readonly line: number;
                                };
                            }[];
                        };
                    }[];
                    readonly dormant?: readonly {
                        readonly css: {
                            readonly file: string;
                            readonly line: number;
                            readonly selector: string;
                            readonly layer?: string;
                            readonly specified: string;
                            readonly conditions?: readonly {
                                readonly kind: "media" | "container";
                                readonly name?: string;
                                readonly params: string;
                                readonly css: {
                                    readonly file: string;
                                    readonly line: number;
                                };
                            }[];
                        };
                    }[];
                } | {
                    readonly kind: "viewport";
                    readonly axis: "inline" | "block";
                    readonly hostInset?: number;
                } | {
                    readonly kind: "contract";
                    readonly path: string;
                    readonly box: string;
                    readonly owner: string;
                    readonly property: "minInlineSize" | "minBlockSize";
                    readonly value: number;
                    readonly selector: string;
                    readonly trusted: true;
                })[];
            };
        };
    }[];
    complete: boolean;
    geometryComplete: boolean;
    assumptions: readonly string[];
    bindings: readonly {
        readonly variant?: number;
        readonly scrollbarProfile?: string;
        readonly path: string;
        readonly declaration: {
            readonly contract: {
                readonly version: 1;
                readonly kind: "contract";
                readonly component: string;
                readonly requires: {
                    readonly inlineSize: {
                        readonly min: number;
                        readonly max: number;
                        readonly minInclusive: boolean;
                        readonly maxInclusive: boolean;
                        readonly minExact: string;
                        readonly maxExact: string;
                    };
                    readonly blockSize: {
                        readonly min: number;
                        readonly max: number;
                        readonly minInclusive: boolean;
                        readonly maxInclusive: boolean;
                        readonly minExact: string;
                        readonly maxExact: string;
                    };
                };
                readonly ensures: {
                    readonly inline: "fit";
                    readonly block: "fit";
                };
                readonly profile: {
                    readonly id: "safe-grid/1";
                    readonly containers: "grid";
                    readonly positioning: "in-flow";
                    readonly boxSizing: "border-box";
                    readonly geometry: "piecewise-affine";
                    readonly overflowPolicies: readonly ["fit"];
                };
                readonly spaces?: never;
                readonly overlays?: never;
            } | {
                readonly version: 1;
                readonly kind: "contract";
                readonly component: string;
                readonly requires: {
                    readonly inlineSize: {
                        readonly min: number;
                        readonly max: number;
                        readonly minInclusive: boolean;
                        readonly maxInclusive: boolean;
                        readonly minExact: string;
                        readonly maxExact: string;
                    };
                    readonly blockSize: {
                        readonly min: number;
                        readonly max: number;
                        readonly minInclusive: boolean;
                        readonly maxInclusive: boolean;
                        readonly minExact: string;
                        readonly maxExact: string;
                    };
                };
                readonly ensures: {
                    readonly inline: "fit";
                    readonly block: "fit";
                };
                readonly profile: {
                    readonly boxSizing: "border-box";
                    readonly containers: "grid";
                    readonly geometry: "piecewise-affine";
                    readonly overflowPolicies: readonly ["fit"];
                    readonly id: "positioned-grid/1";
                    readonly positioning: "local-absolute";
                };
                readonly spaces: readonly {
                    readonly name: string;
                    readonly selector: string;
                }[];
                readonly overlays: readonly {
                    readonly selector: string;
                    readonly within: string;
                }[];
            };
            readonly source: {
                readonly start: number;
                readonly end: number;
            };
        };
    }[];
};
export declare const exposedRoots: (boundaries: readonly LayoutInstance[]) => {
    path: string;
    variant?: number;
    scrollbarProfile?: string;
}[];
export declare function scopeLayout(implementation: LayoutIR, contract: ContractIR, path: string, cases: readonly Scenario[]): {
    component: string;
    cases: readonly Scenario[];
    elements: {
        readonly path: string;
        readonly tag: string;
        readonly id?: string;
        readonly classes: readonly string[];
        readonly owner: string;
        readonly targets?: readonly string[];
        readonly targetIdentity?: "stable" | "unknown";
        readonly variant?: number;
        readonly scrollbarProfile?: string;
    }[];
    boxes: {
        readonly variant?: number;
        readonly scrollbarProfile?: string;
        readonly rect?: {
            readonly inlineStart: {
                readonly coefficient: string;
                readonly constant: string;
                readonly heightCoefficient?: string;
            };
            readonly blockStart: {
                readonly coefficient: string;
                readonly constant: string;
                readonly heightCoefficient?: string;
            };
            readonly inlineSize: {
                readonly coefficient: string;
                readonly constant: string;
                readonly heightCoefficient?: string;
            };
            readonly blockSize: {
                readonly coefficient: string;
                readonly constant: string;
                readonly heightCoefficient?: string;
            };
        };
        readonly position?: "static" | "relative" | "absolute";
        readonly origin?: {
            readonly inline: {
                readonly coefficient: string;
                readonly constant: string;
                readonly heightCoefficient?: string;
            };
            readonly block: {
                readonly coefficient: string;
                readonly constant: string;
                readonly heightCoefficient?: string;
            };
        };
        readonly containingBlock?: {
            readonly path: string;
            readonly inline: {
                readonly coefficient: string;
                readonly constant: string;
                readonly heightCoefficient?: string;
            };
            readonly block: {
                readonly coefficient: string;
                readonly constant: string;
                readonly heightCoefficient?: string;
            };
        };
        readonly box: string;
        readonly path: string;
        readonly range: {
            readonly min: number;
            readonly max: number;
            readonly minInclusive: boolean;
            readonly maxInclusive: boolean;
            readonly minExact: string;
            readonly maxExact: string;
        };
        readonly heightRange?: {
            readonly min: number;
            readonly max: number;
            readonly minInclusive: boolean;
            readonly maxInclusive: boolean;
            readonly minExact: string;
            readonly maxExact: string;
        };
        readonly region?: {
            readonly vertices: readonly {
                readonly width: string;
                readonly height: string;
            }[];
            readonly constraints: readonly {
                readonly coefficient: string;
                readonly constant: string;
                readonly heightCoefficient?: string;
                readonly strict: boolean;
            }[];
        } | undefined;
        readonly boxSizing: "border-box" | "content-box";
        readonly allocated: {
            readonly inline: {
                readonly coefficient: string;
                readonly constant: string;
                readonly heightCoefficient?: string;
            };
            readonly block?: {
                readonly coefficient: string;
                readonly constant: string;
                readonly heightCoefficient?: string;
            };
        };
        readonly border: {
            readonly inline: {
                readonly coefficient: string;
                readonly constant: string;
                readonly heightCoefficient?: string;
            };
            readonly block?: {
                readonly coefficient: string;
                readonly constant: string;
                readonly heightCoefficient?: string;
            };
        };
        readonly content: {
            readonly inline: {
                readonly coefficient: string;
                readonly constant: string;
                readonly heightCoefficient?: string;
            };
            readonly block?: {
                readonly coefficient: string;
                readonly constant: string;
                readonly heightCoefficient?: string;
            };
        };
        readonly padding?: {
            readonly inline: {
                readonly coefficient: string;
                readonly constant: string;
                readonly heightCoefficient?: string;
            };
            readonly block?: {
                readonly coefficient: string;
                readonly constant: string;
                readonly heightCoefficient?: string;
            };
        };
    }[];
    presence: {
        readonly variant?: number;
        readonly scrollbarProfile?: string;
        readonly box: string;
        readonly path: string;
        readonly axis: "inline" | "block";
        readonly overflow: "fit" | "scroll" | "clip" | "visible";
        readonly range: {
            readonly min: number;
            readonly max: number;
            readonly minInclusive: boolean;
            readonly maxInclusive: boolean;
            readonly minExact: string;
            readonly maxExact: string;
        };
        readonly heightRange?: {
            readonly min: number;
            readonly max: number;
            readonly minInclusive: boolean;
            readonly maxInclusive: boolean;
            readonly minExact: string;
            readonly maxExact: string;
        };
        readonly region?: {
            readonly vertices: readonly {
                readonly width: string;
                readonly height: string;
            }[];
            readonly constraints: readonly {
                readonly coefficient: string;
                readonly constant: string;
                readonly heightCoefficient?: string;
                readonly strict: boolean;
            }[];
        };
    }[];
    checks: {
        readonly variant?: number;
        readonly scrollbarProfile?: string;
        readonly box: string;
        readonly path: string;
        readonly code: string;
        readonly axis: "inline" | "block";
        readonly range: {
            readonly min: number;
            readonly max: number;
            readonly minInclusive: boolean;
            readonly maxInclusive: boolean;
            readonly minExact: string;
            readonly maxExact: string;
        };
        readonly heightRange?: {
            readonly min: number;
            readonly max: number;
            readonly minInclusive: boolean;
            readonly maxInclusive: boolean;
            readonly minExact: string;
            readonly maxExact: string;
        };
        readonly region?: {
            readonly vertices: readonly {
                readonly width: string;
                readonly height: string;
            }[];
            readonly constraints: readonly {
                readonly coefficient: string;
                readonly constant: string;
                readonly heightCoefficient?: string;
                readonly strict: boolean;
            }[];
        };
        readonly available: {
            readonly coefficient: string;
            readonly constant: string;
            readonly heightCoefficient?: string;
        };
        readonly required: {
            readonly coefficient: string;
            readonly constant: string;
            readonly heightCoefficient?: string;
        };
        readonly enforced: boolean;
    }[];
    errors: {
        readonly variant?: number;
        readonly scrollbarProfile?: string;
        readonly code: string;
        readonly severity: "error" | "unknown";
        readonly message: string;
        readonly box?: string;
        readonly path?: string;
        readonly range?: {
            readonly min: number;
            readonly max: number;
            readonly minInclusive: boolean;
            readonly maxInclusive: boolean;
            readonly minExact: string;
            readonly maxExact: string;
        };
        readonly axis?: "inline" | "block";
        readonly heightRange?: {
            readonly min: number;
            readonly max: number;
            readonly minInclusive: boolean;
            readonly maxInclusive: boolean;
            readonly minExact: string;
            readonly maxExact: string;
        };
        readonly region?: {
            readonly vertices: readonly {
                readonly width: string;
                readonly height: string;
            }[];
            readonly constraints: readonly {
                readonly coefficient: string;
                readonly constant: string;
                readonly heightCoefficient?: string;
                readonly strict: boolean;
            }[];
        };
        readonly css?: {
            readonly file: string;
            readonly line: number;
            readonly column?: number;
        };
        readonly hint?: string;
        readonly related?: readonly {
            readonly message: string;
            readonly css: {
                readonly file: string;
                readonly line: number;
                readonly column?: number;
            };
        }[];
        readonly conflict?: {
            readonly properties: readonly [string, string];
            readonly longhands: readonly string[];
        };
        readonly source?: {
            readonly start: number;
            readonly end: number;
        };
        readonly witness?: {
            readonly viewport: number;
            readonly viewportExact: string;
            readonly viewportHeight?: number;
            readonly viewportHeightExact?: string;
            readonly available: number;
            readonly required: number;
        };
        readonly text?: {
            readonly maxLength: number;
            readonly fitsUpTo: number;
            readonly widest: string;
        } | {
            readonly lines: number;
            readonly fitsLines: number;
        };
        readonly explanation?: {
            readonly version: 1;
            readonly available: {
                readonly facts: readonly ({
                    readonly path: string;
                    readonly box: string;
                    readonly owner: string;
                    readonly property: string;
                    readonly value: string;
                    readonly origin: "author";
                    readonly css: {
                        readonly file: string;
                        readonly line: number;
                        readonly selector: string;
                        readonly layer?: string;
                        readonly specified: string;
                        readonly conditions?: readonly {
                            readonly kind: "media" | "container";
                            readonly name?: string;
                            readonly params: string;
                            readonly css: {
                                readonly file: string;
                                readonly line: number;
                            };
                        }[];
                    };
                    readonly overridden?: readonly {
                        readonly css: {
                            readonly file: string;
                            readonly line: number;
                            readonly selector: string;
                            readonly layer?: string;
                            readonly specified: string;
                            readonly conditions?: readonly {
                                readonly kind: "media" | "container";
                                readonly name?: string;
                                readonly params: string;
                                readonly css: {
                                    readonly file: string;
                                    readonly line: number;
                                };
                            }[];
                        };
                    }[];
                    readonly dormant?: readonly {
                        readonly css: {
                            readonly file: string;
                            readonly line: number;
                            readonly selector: string;
                            readonly layer?: string;
                            readonly specified: string;
                            readonly conditions?: readonly {
                                readonly kind: "media" | "container";
                                readonly name?: string;
                                readonly params: string;
                                readonly css: {
                                    readonly file: string;
                                    readonly line: number;
                                };
                            }[];
                        };
                    }[];
                } | {
                    readonly path: string;
                    readonly box: string;
                    readonly owner: string;
                    readonly property: string;
                    readonly value: string;
                    readonly origin: "default";
                    readonly overridden?: readonly {
                        readonly css: {
                            readonly file: string;
                            readonly line: number;
                            readonly selector: string;
                            readonly layer?: string;
                            readonly specified: string;
                            readonly conditions?: readonly {
                                readonly kind: "media" | "container";
                                readonly name?: string;
                                readonly params: string;
                                readonly css: {
                                    readonly file: string;
                                    readonly line: number;
                                };
                            }[];
                        };
                    }[];
                    readonly dormant?: readonly {
                        readonly css: {
                            readonly file: string;
                            readonly line: number;
                            readonly selector: string;
                            readonly layer?: string;
                            readonly specified: string;
                            readonly conditions?: readonly {
                                readonly kind: "media" | "container";
                                readonly name?: string;
                                readonly params: string;
                                readonly css: {
                                    readonly file: string;
                                    readonly line: number;
                                };
                            }[];
                        };
                    }[];
                } | {
                    readonly kind: "viewport";
                    readonly axis: "inline" | "block";
                    readonly hostInset?: number;
                } | {
                    readonly kind: "contract";
                    readonly path: string;
                    readonly box: string;
                    readonly owner: string;
                    readonly property: "minInlineSize" | "minBlockSize";
                    readonly value: number;
                    readonly selector: string;
                    readonly trusted: true;
                })[];
            };
            readonly required: {
                readonly facts: readonly ({
                    readonly path: string;
                    readonly box: string;
                    readonly owner: string;
                    readonly property: string;
                    readonly value: string;
                    readonly origin: "author";
                    readonly css: {
                        readonly file: string;
                        readonly line: number;
                        readonly selector: string;
                        readonly layer?: string;
                        readonly specified: string;
                        readonly conditions?: readonly {
                            readonly kind: "media" | "container";
                            readonly name?: string;
                            readonly params: string;
                            readonly css: {
                                readonly file: string;
                                readonly line: number;
                            };
                        }[];
                    };
                    readonly overridden?: readonly {
                        readonly css: {
                            readonly file: string;
                            readonly line: number;
                            readonly selector: string;
                            readonly layer?: string;
                            readonly specified: string;
                            readonly conditions?: readonly {
                                readonly kind: "media" | "container";
                                readonly name?: string;
                                readonly params: string;
                                readonly css: {
                                    readonly file: string;
                                    readonly line: number;
                                };
                            }[];
                        };
                    }[];
                    readonly dormant?: readonly {
                        readonly css: {
                            readonly file: string;
                            readonly line: number;
                            readonly selector: string;
                            readonly layer?: string;
                            readonly specified: string;
                            readonly conditions?: readonly {
                                readonly kind: "media" | "container";
                                readonly name?: string;
                                readonly params: string;
                                readonly css: {
                                    readonly file: string;
                                    readonly line: number;
                                };
                            }[];
                        };
                    }[];
                } | {
                    readonly path: string;
                    readonly box: string;
                    readonly owner: string;
                    readonly property: string;
                    readonly value: string;
                    readonly origin: "default";
                    readonly overridden?: readonly {
                        readonly css: {
                            readonly file: string;
                            readonly line: number;
                            readonly selector: string;
                            readonly layer?: string;
                            readonly specified: string;
                            readonly conditions?: readonly {
                                readonly kind: "media" | "container";
                                readonly name?: string;
                                readonly params: string;
                                readonly css: {
                                    readonly file: string;
                                    readonly line: number;
                                };
                            }[];
                        };
                    }[];
                    readonly dormant?: readonly {
                        readonly css: {
                            readonly file: string;
                            readonly line: number;
                            readonly selector: string;
                            readonly layer?: string;
                            readonly specified: string;
                            readonly conditions?: readonly {
                                readonly kind: "media" | "container";
                                readonly name?: string;
                                readonly params: string;
                                readonly css: {
                                    readonly file: string;
                                    readonly line: number;
                                };
                            }[];
                        };
                    }[];
                } | {
                    readonly kind: "viewport";
                    readonly axis: "inline" | "block";
                    readonly hostInset?: number;
                } | {
                    readonly kind: "contract";
                    readonly path: string;
                    readonly box: string;
                    readonly owner: string;
                    readonly property: "minInlineSize" | "minBlockSize";
                    readonly value: number;
                    readonly selector: string;
                    readonly trusted: true;
                })[];
            };
        };
    }[];
    version: 1;
    kind: "layout";
    scope: {
        readonly mediaFeatures?: {
            readonly hover?: "none" | "hover";
            readonly pointer?: "none" | "coarse" | "fine";
            readonly 'prefers-reduced-motion'?: "no-preference" | "reduce";
        };
        readonly axis: "inline" | "both";
        readonly viewport: {
            readonly min: number;
            readonly max: number;
            readonly minInclusive: boolean;
            readonly maxInclusive: boolean;
            readonly minExact: string;
            readonly maxExact: string;
            readonly height?: {
                readonly min: number;
                readonly max: number;
                readonly minInclusive: boolean;
                readonly maxInclusive: boolean;
                readonly minExact: string;
                readonly maxExact: string;
            } | null;
        };
        readonly hostInset: number;
        readonly hostBlockInset?: number;
        readonly closedCSS: true;
        readonly browserRounding: false;
        readonly blockSizing: boolean;
        readonly scrollbarProfiles?: readonly {
            readonly name: string;
            readonly inlineSize: number;
            readonly blockSize: number;
            readonly thinInlineSize?: number;
            readonly thinBlockSize?: number;
        }[];
    };
    diagnostics: readonly {
        readonly variant?: number;
        readonly scrollbarProfile?: string;
        readonly code: string;
        readonly severity: "error" | "unknown";
        readonly message: string;
        readonly box?: string;
        readonly path?: string;
        readonly range?: {
            readonly min: number;
            readonly max: number;
            readonly minInclusive: boolean;
            readonly maxInclusive: boolean;
            readonly minExact: string;
            readonly maxExact: string;
        };
        readonly axis?: "inline" | "block";
        readonly heightRange?: {
            readonly min: number;
            readonly max: number;
            readonly minInclusive: boolean;
            readonly maxInclusive: boolean;
            readonly minExact: string;
            readonly maxExact: string;
        };
        readonly region?: {
            readonly vertices: readonly {
                readonly width: string;
                readonly height: string;
            }[];
            readonly constraints: readonly {
                readonly coefficient: string;
                readonly constant: string;
                readonly heightCoefficient?: string;
                readonly strict: boolean;
            }[];
        };
        readonly css?: {
            readonly file: string;
            readonly line: number;
            readonly column?: number;
        };
        readonly hint?: string;
        readonly related?: readonly {
            readonly message: string;
            readonly css: {
                readonly file: string;
                readonly line: number;
                readonly column?: number;
            };
        }[];
        readonly conflict?: {
            readonly properties: readonly [string, string];
            readonly longhands: readonly string[];
        };
        readonly source?: {
            readonly start: number;
            readonly end: number;
        };
        readonly witness?: {
            readonly viewport: number;
            readonly viewportExact: string;
            readonly viewportHeight?: number;
            readonly viewportHeightExact?: string;
            readonly available: number;
            readonly required: number;
        };
        readonly text?: {
            readonly maxLength: number;
            readonly fitsUpTo: number;
            readonly widest: string;
        } | {
            readonly lines: number;
            readonly fitsLines: number;
        };
        readonly explanation?: {
            readonly version: 1;
            readonly available: {
                readonly facts: readonly ({
                    readonly path: string;
                    readonly box: string;
                    readonly owner: string;
                    readonly property: string;
                    readonly value: string;
                    readonly origin: "author";
                    readonly css: {
                        readonly file: string;
                        readonly line: number;
                        readonly selector: string;
                        readonly layer?: string;
                        readonly specified: string;
                        readonly conditions?: readonly {
                            readonly kind: "media" | "container";
                            readonly name?: string;
                            readonly params: string;
                            readonly css: {
                                readonly file: string;
                                readonly line: number;
                            };
                        }[];
                    };
                    readonly overridden?: readonly {
                        readonly css: {
                            readonly file: string;
                            readonly line: number;
                            readonly selector: string;
                            readonly layer?: string;
                            readonly specified: string;
                            readonly conditions?: readonly {
                                readonly kind: "media" | "container";
                                readonly name?: string;
                                readonly params: string;
                                readonly css: {
                                    readonly file: string;
                                    readonly line: number;
                                };
                            }[];
                        };
                    }[];
                    readonly dormant?: readonly {
                        readonly css: {
                            readonly file: string;
                            readonly line: number;
                            readonly selector: string;
                            readonly layer?: string;
                            readonly specified: string;
                            readonly conditions?: readonly {
                                readonly kind: "media" | "container";
                                readonly name?: string;
                                readonly params: string;
                                readonly css: {
                                    readonly file: string;
                                    readonly line: number;
                                };
                            }[];
                        };
                    }[];
                } | {
                    readonly path: string;
                    readonly box: string;
                    readonly owner: string;
                    readonly property: string;
                    readonly value: string;
                    readonly origin: "default";
                    readonly overridden?: readonly {
                        readonly css: {
                            readonly file: string;
                            readonly line: number;
                            readonly selector: string;
                            readonly layer?: string;
                            readonly specified: string;
                            readonly conditions?: readonly {
                                readonly kind: "media" | "container";
                                readonly name?: string;
                                readonly params: string;
                                readonly css: {
                                    readonly file: string;
                                    readonly line: number;
                                };
                            }[];
                        };
                    }[];
                    readonly dormant?: readonly {
                        readonly css: {
                            readonly file: string;
                            readonly line: number;
                            readonly selector: string;
                            readonly layer?: string;
                            readonly specified: string;
                            readonly conditions?: readonly {
                                readonly kind: "media" | "container";
                                readonly name?: string;
                                readonly params: string;
                                readonly css: {
                                    readonly file: string;
                                    readonly line: number;
                                };
                            }[];
                        };
                    }[];
                } | {
                    readonly kind: "viewport";
                    readonly axis: "inline" | "block";
                    readonly hostInset?: number;
                } | {
                    readonly kind: "contract";
                    readonly path: string;
                    readonly box: string;
                    readonly owner: string;
                    readonly property: "minInlineSize" | "minBlockSize";
                    readonly value: number;
                    readonly selector: string;
                    readonly trusted: true;
                })[];
            };
            readonly required: {
                readonly facts: readonly ({
                    readonly path: string;
                    readonly box: string;
                    readonly owner: string;
                    readonly property: string;
                    readonly value: string;
                    readonly origin: "author";
                    readonly css: {
                        readonly file: string;
                        readonly line: number;
                        readonly selector: string;
                        readonly layer?: string;
                        readonly specified: string;
                        readonly conditions?: readonly {
                            readonly kind: "media" | "container";
                            readonly name?: string;
                            readonly params: string;
                            readonly css: {
                                readonly file: string;
                                readonly line: number;
                            };
                        }[];
                    };
                    readonly overridden?: readonly {
                        readonly css: {
                            readonly file: string;
                            readonly line: number;
                            readonly selector: string;
                            readonly layer?: string;
                            readonly specified: string;
                            readonly conditions?: readonly {
                                readonly kind: "media" | "container";
                                readonly name?: string;
                                readonly params: string;
                                readonly css: {
                                    readonly file: string;
                                    readonly line: number;
                                };
                            }[];
                        };
                    }[];
                    readonly dormant?: readonly {
                        readonly css: {
                            readonly file: string;
                            readonly line: number;
                            readonly selector: string;
                            readonly layer?: string;
                            readonly specified: string;
                            readonly conditions?: readonly {
                                readonly kind: "media" | "container";
                                readonly name?: string;
                                readonly params: string;
                                readonly css: {
                                    readonly file: string;
                                    readonly line: number;
                                };
                            }[];
                        };
                    }[];
                } | {
                    readonly path: string;
                    readonly box: string;
                    readonly owner: string;
                    readonly property: string;
                    readonly value: string;
                    readonly origin: "default";
                    readonly overridden?: readonly {
                        readonly css: {
                            readonly file: string;
                            readonly line: number;
                            readonly selector: string;
                            readonly layer?: string;
                            readonly specified: string;
                            readonly conditions?: readonly {
                                readonly kind: "media" | "container";
                                readonly name?: string;
                                readonly params: string;
                                readonly css: {
                                    readonly file: string;
                                    readonly line: number;
                                };
                            }[];
                        };
                    }[];
                    readonly dormant?: readonly {
                        readonly css: {
                            readonly file: string;
                            readonly line: number;
                            readonly selector: string;
                            readonly layer?: string;
                            readonly specified: string;
                            readonly conditions?: readonly {
                                readonly kind: "media" | "container";
                                readonly name?: string;
                                readonly params: string;
                                readonly css: {
                                    readonly file: string;
                                    readonly line: number;
                                };
                            }[];
                        };
                    }[];
                } | {
                    readonly kind: "viewport";
                    readonly axis: "inline" | "block";
                    readonly hostInset?: number;
                } | {
                    readonly kind: "contract";
                    readonly path: string;
                    readonly box: string;
                    readonly owner: string;
                    readonly property: "minInlineSize" | "minBlockSize";
                    readonly value: number;
                    readonly selector: string;
                    readonly trusted: true;
                })[];
            };
        };
    }[];
    complete: boolean;
    geometryComplete: boolean;
    assumptions: readonly string[];
    bindings: readonly {
        readonly variant?: number;
        readonly scrollbarProfile?: string;
        readonly path: string;
        readonly declaration: {
            readonly contract: {
                readonly version: 1;
                readonly kind: "contract";
                readonly component: string;
                readonly requires: {
                    readonly inlineSize: {
                        readonly min: number;
                        readonly max: number;
                        readonly minInclusive: boolean;
                        readonly maxInclusive: boolean;
                        readonly minExact: string;
                        readonly maxExact: string;
                    };
                    readonly blockSize: {
                        readonly min: number;
                        readonly max: number;
                        readonly minInclusive: boolean;
                        readonly maxInclusive: boolean;
                        readonly minExact: string;
                        readonly maxExact: string;
                    };
                };
                readonly ensures: {
                    readonly inline: "fit";
                    readonly block: "fit";
                };
                readonly profile: {
                    readonly id: "safe-grid/1";
                    readonly containers: "grid";
                    readonly positioning: "in-flow";
                    readonly boxSizing: "border-box";
                    readonly geometry: "piecewise-affine";
                    readonly overflowPolicies: readonly ["fit"];
                };
                readonly spaces?: never;
                readonly overlays?: never;
            } | {
                readonly version: 1;
                readonly kind: "contract";
                readonly component: string;
                readonly requires: {
                    readonly inlineSize: {
                        readonly min: number;
                        readonly max: number;
                        readonly minInclusive: boolean;
                        readonly maxInclusive: boolean;
                        readonly minExact: string;
                        readonly maxExact: string;
                    };
                    readonly blockSize: {
                        readonly min: number;
                        readonly max: number;
                        readonly minInclusive: boolean;
                        readonly maxInclusive: boolean;
                        readonly minExact: string;
                        readonly maxExact: string;
                    };
                };
                readonly ensures: {
                    readonly inline: "fit";
                    readonly block: "fit";
                };
                readonly profile: {
                    readonly boxSizing: "border-box";
                    readonly containers: "grid";
                    readonly geometry: "piecewise-affine";
                    readonly overflowPolicies: readonly ["fit"];
                    readonly id: "positioned-grid/1";
                    readonly positioning: "local-absolute";
                };
                readonly spaces: readonly {
                    readonly name: string;
                    readonly selector: string;
                }[];
                readonly overlays: readonly {
                    readonly selector: string;
                    readonly within: string;
                }[];
            };
            readonly source: {
                readonly start: number;
                readonly end: number;
            };
        };
    }[];
};
/** A source-declared child root needs an explicit request from one caller. */
export declare function parentPlacements(implementation: LayoutIR, instances: readonly LayoutInstance[], path: string, cases: readonly Scenario[]): {
    parent: LayoutInstance;
    cases: Scenario[];
}[];
export {};
