import componentFileStructure from "./rules/component-file-structure";
import componentScssModule from "./rules/component-scss-module";
import lucideIconSizeProp from "./rules/lucide-icon-size-prop";
import noHandrolledForm from "./rules/no-handrolled-form";
import noRequiredPropWithSchema from "./rules/no-required-prop-with-schema";
import requireFormSchema from "./rules/require-form-schema";
import noStaticInlineStyle from "./rules/no-static-inline-style";
import noTemplateLiteralClassname from "./rules/no-template-literal-classname";
import noUnboundFieldControl from "./rules/no-unbound-field-control";
import noValidityDisabledSubmit from "./rules/no-validity-disabled-submit";
import requireStory from "./rules/require-story";

export const rules = {
    "component-file-structure": componentFileStructure,
    "component-scss-module": componentScssModule,
    "lucide-icon-size-prop": lucideIconSizeProp,
    "no-handrolled-form": noHandrolledForm,
    "no-required-prop-with-schema": noRequiredPropWithSchema,
    "require-form-schema": requireFormSchema,
    "no-static-inline-style": noStaticInlineStyle,
    "no-template-literal-classname": noTemplateLiteralClassname,
    "no-unbound-field-control": noUnboundFieldControl,
    "no-validity-disabled-submit": noValidityDisabledSubmit,
    "require-story": requireStory,
};

export default { rules };
