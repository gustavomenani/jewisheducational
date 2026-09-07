<script setup>
import { computed, ref, useId } from 'vue';

const props = defineProps({
  modelValue: { type: String, default: '' },
  placeholder: { type: String, default: '' },
  required: { type: Boolean, default: false },
  minlength: { type: [Number, String], default: undefined },
  autocomplete: { type: String, default: 'current-password' },
  id: { type: String, default: undefined },
  ariaLabel: { type: String, default: 'Password' },
});

const emit = defineEmits(['update:modelValue']);

const show = ref(false);
const inputType = computed(() => (show.value ? 'text' : 'password'));
const generatedId = useId();
const inputId = computed(() => props.id || generatedId);
</script>

<template>
  <div class="password-input-wrap">
    <input
      :id="inputId"
      :value="modelValue"
      :type="inputType"
      class="form-control password-input-field"
      :placeholder="placeholder"
      :required="required"
      :minlength="minlength"
      :autocomplete="autocomplete"
      :aria-label="ariaLabel"
      @input="emit('update:modelValue', $event.target.value)"
    />
    <button
      type="button"
      class="password-toggle-btn"
      :aria-label="show ? 'Hide password' : 'Show password'"
      :title="show ? 'Hide password' : 'Show password'"
      :aria-controls="inputId"
      :aria-pressed="show"
      @click="show = !show"
    >
      <i :class="show ? 'bi bi-eye-slash' : 'bi bi-eye'"></i>
    </button>
  </div>
</template>
