import {
  type APILabelComponent,
  type APIModalInteractionResponseCallbackComponent,
  type APIModalSubmissionComponent,
  type APISelectMenuOption,
  type APIStringSelectComponent,
  type ModalSubmitLabelComponent,
  ComponentType,
  APIRoleSelectComponent,
  APIUserSelectComponent,
  APIChannelSelectComponent,
  SelectMenuDefaultValueType,
} from "discord-api-types/v10";

type LabelDefs = readonly APILabelComponent[];

/** Map component → parsed value type */
type ParsedValueOf<C> = C extends { type: ComponentType.TextInput }
  ? string
  : C extends { type: ComponentType.Checkbox }
    ? boolean
    : C extends { type: ComponentType.StringSelect }
      ? string[]
      : C extends { type: ComponentType.ChannelSelect }
        ? string[]
        : C extends { type: ComponentType.UserSelect }
          ? string[]
          : C extends { type: ComponentType.RoleSelect }
            ? string[]
            : C extends { type: ComponentType.MentionableSelect }
              ? string[]
              : unknown;

/** Build typed result from label definitions */
type ParseResult<Defs extends LabelDefs> = {
  [L in Defs[number] as L["component"] extends {
    custom_id: infer ID extends string;
  }
    ? ID
    : never]: ParsedValueOf<L["component"]>;
};

/** Build typed defaults record from label definitions */
type DefaultsFor<Defs extends LabelDefs> = {
  [L in Defs[number] as L["component"] extends {
    custom_id: infer ID extends string;
  }
    ? ID
    : never]?: ParsedValueOf<L["component"]>;
};

const SELECT_DEFAULT_VALUE_TYPE: Partial<Record<ComponentType, SelectMenuDefaultValueType>> = {
  [ComponentType.ChannelSelect]: SelectMenuDefaultValueType.Channel,
  [ComponentType.UserSelect]: SelectMenuDefaultValueType.User,
  [ComponentType.RoleSelect]: SelectMenuDefaultValueType.Role,
};

export function createComponents<const Defs extends LabelDefs>(
  defs: Defs,
  defaults?: DefaultsFor<Defs>,
): APIModalInteractionResponseCallbackComponent[] {
  return defs.map((labelDef): APILabelComponent => {
    const inner = labelDef.component;
    const customId = "custom_id" in inner ? (inner.custom_id as keyof DefaultsFor<Defs>) : undefined;
    const defaultVal = customId != null ? defaults?.[customId] : undefined;

    return {
      type: ComponentType.Label,
      label: labelDef.label,
      ...(labelDef.description && { description: labelDef.description }),
      component: applyDefault(inner, defaultVal),
    };
  });
}

function applyDefault(component: APILabelComponent["component"], defaultVal: unknown): APILabelComponent["component"] {
  switch (component.type) {
    case ComponentType.TextInput: {
      if (typeof defaultVal !== "string") return component;
      return { ...component, value: defaultVal };
    }

    case ComponentType.Checkbox: {
      if (typeof defaultVal !== "boolean") return component;
      return { ...component, default: defaultVal };
    }

    case ComponentType.StringSelect: {
      const selected = toStringArray(defaultVal);
      if (!selected) return component;
      const c = component as APIStringSelectComponent;
      return {
        ...c,
        options: c.options.map(
          (opt): APISelectMenuOption => ({
            ...opt,
            default: selected.includes(opt.value),
          }),
        ),
      };
    }

    case ComponentType.ChannelSelect:
    case ComponentType.UserSelect:
    case ComponentType.RoleSelect: {
      const ids = toStringArray(defaultVal);
      if (!ids) return component;
      const dvType = SELECT_DEFAULT_VALUE_TYPE[component.type]!;
      return {
        ...component,
        default_values: ids.map((id) => ({ id, type: dvType })),
      } as APIChannelSelectComponent | APIUserSelectComponent | APIRoleSelectComponent;
    }

    case ComponentType.MentionableSelect: {
      // MentionableSelect accepts User | Role — caller must provide full objects
      // Pass through unchanged; use the definition's default_values directly
      return component;
    }

    default:
      return component;
  }
}

function toStringArray(val: unknown): string[] | null {
  if (val == null) return null;
  if (Array.isArray(val)) return val;
  return null;
}

export function parseComponents<const Defs extends LabelDefs>(defs: Defs, submitted: APIModalSubmissionComponent[]): ParseResult<Defs> {
  const result: Record<string, unknown> = {};

  const expectedTypes = new Map<string, ComponentType>();
  for (const labelDef of defs) {
    if ("custom_id" in labelDef.component) {
      expectedTypes.set(labelDef.component.custom_id, labelDef.component.type);
    }
  }

  for (const top of submitted) {
    if (top.type === ComponentType.Label) {
      const { component: inner } = top as ModalSubmitLabelComponent;
      const expected = expectedTypes.get(inner.custom_id);
      if (expected != null) {
        result[inner.custom_id] = extractValue(inner, expected);
      }
    } else if (top.type === ComponentType.ActionRow) {
      for (const inner of top.components) {
        const expected = expectedTypes.get(inner.custom_id);
        if (expected != null) {
          result[inner.custom_id] = extractValue(inner, expected);
        }
      }
    }
  }

  for (const labelDef of defs) {
    if ("custom_id" in labelDef.component) {
      const key = labelDef.component.custom_id;
      if (!(key in result)) {
        result[key] = zeroValue(labelDef.component.type);
      }
    }
  }

  return result as ParseResult<Defs>;
}

function extractValue(component: { type: ComponentType; custom_id: string }, expectedType: ComponentType): string | string[] | boolean {
  switch (expectedType) {
    case ComponentType.TextInput:
      return "value" in component && typeof component.value === "string" ? component.value : "";

    case ComponentType.Checkbox:
      return "value" in component && typeof component.value === "boolean" ? component.value : false;

    case ComponentType.StringSelect:
    case ComponentType.ChannelSelect:
    case ComponentType.UserSelect:
    case ComponentType.RoleSelect:
    case ComponentType.MentionableSelect:
      return "values" in component && Array.isArray(component.values) ? (component.values as string[]) : [];

    default:
      return "";
  }
}

function zeroValue(type: ComponentType): string | string[] | boolean {
  switch (type) {
    case ComponentType.TextInput:
      return "";
    case ComponentType.Checkbox:
      return false;
    default:
      return [];
  }
}
