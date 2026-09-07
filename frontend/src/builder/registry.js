// Block type registry. Each entry describes how a block renders, its editable
// fields (for the properties panel) and its default props when first dropped.
// Adding a new block = adding one entry here + its render component.

import HeadingBlock from './blocks/HeadingBlock.vue';
import ParagraphBlock from './blocks/ParagraphBlock.vue';
import ImageBlock from './blocks/ImageBlock.vue';
import ButtonBlock from './blocks/ButtonBlock.vue';
import SpacerBlock from './blocks/SpacerBlock.vue';
import DividerBlock from './blocks/DividerBlock.vue';
import CtaBlock from './blocks/CtaBlock.vue';
import FeaturesBlock from './blocks/FeaturesBlock.vue';
import AlertBlock from './blocks/AlertBlock.vue';
import VideoBlock from './blocks/VideoBlock.vue';

export const BLOCK_TYPES = {
  heading: {
    label: 'Title',
    icon: 'bi-type-h1',
    component: HeadingBlock,
    defaults: { text: 'New title', level: 2, align: 'left', color: '', textStyle: {} },
    fields: [
      { key: 'text', label: 'Title text', type: 'textarea', clearable: true },
      { key: 'level', label: 'Level', type: 'select', options: [1, 2, 3, 4] },
      { key: 'align', label: 'Alignment', type: 'select', options: ['left', 'center', 'right'] },
      { key: 'color', label: 'Color', type: 'color' },
    ],
  },
  paragraph: {
    label: 'Text',
    icon: 'bi-text-paragraph',
    component: ParagraphBlock,
    defaults: { text: 'Write your text here.', align: 'left', color: '', textStyle: {} },
    fields: [
      { key: 'text', label: 'Text', type: 'textarea', clearable: true },
      { key: 'align', label: 'Alignment', type: 'select', options: ['left', 'center', 'right'] },
      { key: 'color', label: 'Color', type: 'color' },
    ],
  },
  image: {
    label: 'Image',
    icon: 'bi-image',
    component: ImageBlock,
    defaults: {
      src: '', alt: '', caption: '', link: '', align: 'center',
      size: 'large', radius: 12, maxWidth: 100,
    },
    fields: [
      { key: 'src', label: 'Image', type: 'image' },
      { key: 'alt', label: 'Alternative text', type: 'text' },
      { key: 'caption', label: 'Caption', type: 'text', clearable: true },
      { key: 'link', label: 'Link (optional)', type: 'text' },
      { key: 'align', label: 'Alignment', type: 'align' },
      {
        key: 'size', label: 'Size', type: 'select',
        options: [
          { value: 'small', label: 'Small' },
          { value: 'medium', label: 'Medium' },
          { value: 'large', label: 'Large' },
          { value: 'full', label: 'Full width' },
        ],
      },
      { key: 'radius', label: 'Rounded border (px)', type: 'number' },
    ],
  },
  button: {
    label: 'Button',
    icon: 'bi-hand-index-thumb',
    component: ButtonBlock,
    defaults: { text: 'Click here', link: '/', align: 'left', variant: 'primary' },
    fields: [
      { key: 'text', label: 'Button text', type: 'text', clearable: true },
      { key: 'link', label: 'Link', type: 'text' },
      { key: 'align', label: 'Alignment', type: 'select', options: ['left', 'center', 'right'] },
      { key: 'variant', label: 'Style', type: 'select', options: ['primary', 'secondary', 'outline'] },
    ],
  },
  cta: {
    label: 'Call to Action',
    icon: 'bi-megaphone',
    component: CtaBlock,
    defaults: {
      title: 'Ready to get started?',
      subtitle: 'Join us today and transform your learning.',
      buttonText: 'Get Started',
      buttonLink: '/',
      buttonVariant: 'primary',
      bgStyle: 'gradient',
      bgColor: '#3bafb8',
      textColor: '#ffffff',
      align: 'center',
    },
    fields: [
      { key: 'title', label: 'Title', type: 'text', clearable: true },
      { key: 'subtitle', label: 'Subtitle', type: 'text', clearable: true },
      { key: 'buttonText', label: 'Button text', type: 'text', clearable: true },
      { key: 'buttonLink', label: 'Button link', type: 'text' },
      { key: 'buttonVariant', label: 'Button style', type: 'select', options: ['primary', 'secondary', 'outline', 'light'] },
      { key: 'bgStyle', label: 'Background style', type: 'select', options: ['gradient', 'primary', 'dark', 'light', 'custom'] },
      { key: 'bgColor', label: 'Custom background color', type: 'color' },
      { key: 'textColor', label: 'Custom text color', type: 'color' },
      { key: 'align', label: 'Alignment', type: 'select', options: ['center', 'left', 'right'] },
    ],
  },
  features: {
    label: 'Resources / Highlights',
    icon: 'bi-grid-3x3-gap',
    component: FeaturesBlock,
    defaults: {
      columns: 3,
      align: 'center',
      iconColor: '#3bafb8',
      item1Icon: 'bi-star-fill',
      item1Title: 'Resource 1',
      item1Text: 'A detailed description of the offered resource or benefit.',
      item2Icon: 'bi-lightning-charge-fill',
      item2Title: 'Resource 2',
      item2Text: 'A detailed description of the offered resource or benefit.',
      item3Icon: 'bi-shield-check',
      item3Title: 'Resource 3',
      item3Text: 'A detailed description of the offered resource or benefit.',
    },
    fields: [
      { key: 'columns', label: 'Columns', type: 'select', options: [2, 3, 4] },
      { key: 'align', label: 'Text alignment', type: 'select', options: ['center', 'left', 'right'] },
      { key: 'iconColor', label: 'Icon Color', type: 'color' },
      { key: 'item1Icon', label: 'Icon 1 (Bootstrap Icon)', type: 'text' },
      { key: 'item1Title', label: 'Title 1', type: 'text', clearable: true },
      { key: 'item1Text', label: 'Text 1', type: 'text', clearable: true },
      { key: 'item2Icon', label: 'Icon 2 (Bootstrap Icon)', type: 'text' },
      { key: 'item2Title', label: 'Title 2', type: 'text', clearable: true },
      { key: 'item2Text', label: 'Text 2', type: 'text', clearable: true },
      { key: 'item3Icon', label: 'Icon 3 (Bootstrap Icon)', type: 'text' },
      { key: 'item3Title', label: 'Title 3', type: 'text', clearable: true },
      { key: 'item3Text', label: 'Text 3', type: 'text', clearable: true },
    ],
  },
  alert: {
    label: 'Note / Notice',
    icon: 'bi-exclamation-triangle',
    component: AlertBlock,
    defaults: {
      variant: 'info',
      title: 'Important Note',
      text: 'This is a highlighted notice with relevant information for users.',
      icon: '',
    },
    fields: [
      { key: 'variant', label: 'Notice style', type: 'select', options: ['info', 'note', 'warning', 'highlight'] },
      { key: 'title', label: 'Title', type: 'text', clearable: true },
      { key: 'text', label: 'Content', type: 'text', clearable: true },
      { key: 'icon', label: 'Custom icon (Bootstrap Icon)', type: 'text' },
    ],
  },
  video: {
    label: 'Embedded Video',
    icon: 'bi-play-btn',
    component: VideoBlock,
    defaults: {
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      aspectRatio: '16:9',
      maxWidth: 100,
      align: 'center',
      title: '',
    },
    fields: [
      { key: 'url', label: 'Video URL (YouTube, Vimeo, or MP4)', type: 'text' },
      { key: 'aspectRatio', label: 'Aspect ratio', type: 'select', options: ['16:9', '4:3', '1:1'] },
      { key: 'maxWidth', label: 'Maximum width (%)', type: 'number' },
      { key: 'align', label: 'Alignment', type: 'select', options: ['center', 'left', 'right'] },
      { key: 'title', label: 'Caption / Title', type: 'text', clearable: true },
    ],
  },
  spacer: {
    label: 'Spacing',
    icon: 'bi-distribute-vertical',
    component: SpacerBlock,
    defaults: { height: 32 },
    fields: [{ key: 'height', label: 'Height (px)', type: 'number' }],
  },
  divider: {
    label: 'Divider',
    icon: 'bi-dash-lg',
    component: DividerBlock,
    defaults: { color: '#dce8f0' },
    fields: [{ key: 'color', label: 'Color', type: 'color' }],
  },
};

export const BLOCK_LIBRARY = Object.entries(BLOCK_TYPES).map(([type, def]) => ({
  type,
  label: def.label,
  icon: def.icon,
}));

export function blockDef(type) {
  return BLOCK_TYPES[type] || null;
}

export function defaultPropsFor(type) {
  const def = blockDef(type);
  return def ? JSON.parse(JSON.stringify(def.defaults)) : {};
}
