<script setup>

import { computed, ref } from 'vue';

import PayPalCheckout from '@/components/PayPalCheckout.vue';

import StripeCheckout from '@/components/StripeCheckout.vue';



const props = defineProps({

  modelValue: { type: Boolean, default: false },

  type: { type: String, default: 'limit' },

  quota: { type: Object, default: null },

  resetMessage: { type: String, default: '' },

  paywall: { type: Object, default: () => ({}) },

  errorMessage: { type: String, default: '' },

});



const emit = defineEmits(['update:modelValue', 'upgraded']);



const paymentLoading = ref(false);

const paymentError = ref('');



const title = computed(() => {

  if (props.type === 'school') return props.paywall?.schoolTitle || 'School plan exclusive material';

  if (props.type === 'premium') return props.paywall?.premiumTitle || 'Recurso Premium';

  return props.paywall?.limitTitle || 'Download limit reached';

});



const upgradeUrl = computed(() => {

  const url = props.paywall?.upgradeUrl?.trim();

  if (!url) return null;

  if (url.startsWith('http') || url.startsWith('/')) return url;

  return `/${url}`;

});



const isExternal = computed(() => upgradeUrl.value?.startsWith('http'));

const paymentsEnabled = computed(() => !!props.paywall?.paymentsEnabled && !!props.paywall?.paypalClientId);

const stripeEnabled = computed(() => !!props.paywall?.stripeEnabled);



function close() {

  emit('update:modelValue', false);

}



function onPayPalSuccess(data) {

  paymentError.value = '';

  emit('upgraded', data);

  close();

}



function onPayPalError(message) {

  paymentError.value = typeof message === 'string' ? message : 'Could not complete payment.';

}

</script>



<template>

  <Teleport to="body">

    <Transition name="edu-drawer-fade">

      <div v-if="modelValue" class="paywall-backdrop" @click="close"></div>

    </Transition>

    <Transition name="paywall-pop">

      <div v-if="modelValue" class="paywall-modal" role="dialog" aria-modal="true">

        <button type="button" class="paywall-close" aria-label="Close" @click="close">

          <i class="bi bi-x-lg"></i>

        </button>



        <div class="paywall-icon" :class="type === 'limit' ? 'paywall-icon-limit' : 'paywall-icon-premium'">

          <i :class="type === 'limit' ? 'bi bi-download' : type === 'school' ? 'bi bi-mortarboard-fill' : 'bi bi-star-fill'"></i>

        </div>



        <h2 class="paywall-title">{{ title }}</h2>



        <p v-if="type === 'limit' && quota" class="paywall-lead">

          You have used <strong>{{ quota.used }}</strong> of <strong>{{ quota.max }}</strong> downloads

          <span v-if="quota.periodLabel">{{ quota.periodLabel }}</span>.

        </p>



        <p v-if="resetMessage && type === 'limit'" class="paywall-reset">

          <i class="bi bi-clock me-1"></i>{{ resetMessage }}

        </p>



        <p v-else-if="errorMessage" class="paywall-lead">{{ errorMessage }}</p>



        <p v-if="type === 'premium'" class="paywall-lead">

          Downloading all letters in one PDF is available only to Premium subscribers.

          Individual sheets remain available within your free limit.

        </p>



        <div v-if="(paywall?.planName || paywall?.planPrice) && type !== 'school'" class="paywall-plan-box">

          <div class="paywall-plan-name">{{ paywall.planName || 'Premium' }}</div>

          <div v-if="paywall.planPrice" class="paywall-plan-price">{{ paywall.planPrice }}</div>

          <div class="paywall-plan-perks small text-muted">

            Unlimited downloads · Full PDF · Full access

          </div>

        </div>



        <p v-if="paymentError" class="small text-danger mb-2">{{ paymentError }}</p>



        <div class="paywall-actions">

          <p v-if="type === 'school'" class="small text-muted text-center mb-2">

            The School plan will be available soon. Get in touch to request access.

          </p>

          <StripeCheckout

            v-if="stripeEnabled && type !== 'school'"

            :class="{ 'mb-2': paymentsEnabled }"

            @error="paymentError = $event"

          />

          <PayPalCheckout

            v-if="paymentsEnabled && type !== 'school'"

            :client-id="paywall.paypalClientId"

            :currency="paywall.paypalCurrency || 'USD'"

            :disabled="paymentLoading"

            @success="onPayPalSuccess"

            @error="onPayPalError"

            @loading="paymentLoading = $event"

          />

          <a

            v-else-if="upgradeUrl && !stripeEnabled"

            :href="upgradeUrl"

            class="btn btn-primary btn-lg w-100"

            :target="isExternal ? '_blank' : undefined"

            :rel="isExternal ? 'noopener' : undefined"

            @click="close"

          >

            <i class="bi bi-star me-2"></i>

            Subscribe to {{ paywall?.planName || 'Premium' }}

            <span v-if="paywall?.planPrice"> — {{ paywall.planPrice }}</span>

          </a>

          <p v-else-if="!stripeEnabled" class="small text-muted text-center mb-2">

            Payments are coming soon. Get in touch to subscribe to Premium.

          </p>

          <button type="button" class="btn btn-outline-secondary w-100 mt-2" @click="close">

            Aguardar e tentar depois

          </button>

        </div>

      </div>

    </Transition>

  </Teleport>

</template>

