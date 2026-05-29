import componentFileStructure from "./rules/component-file-structure";
import componentScssModule from "./rules/component-scss-module";
import lucideIconSizeProp from "./rules/lucide-icon-size-prop";
import noStaticInlineStyle from "./rules/no-static-inline-style";
import noTemplateLiteralClassname from "./rules/no-template-literal-classname";

export const rules = {
    "component-file-structure": componentFileStructure,
    "component-scss-module": componentScssModule,
    "lucide-icon-size-prop": lucideIconSizeProp,
    "no-static-inline-style": noStaticInlineStyle,
    "no-template-literal-classname": noTemplateLiteralClassname,
};

export default { rules };
