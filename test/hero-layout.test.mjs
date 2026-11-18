import test from 'node:test';
import assert from 'node:assert/strict';
import { auditHeroLayout } from '../scripts/check-hero-layout.mjs';

test('hero layout accepts a verified logo area with a visible gap',()=>{
  const result=auditHeroLayout({canvas:{width:1080,height:1554},safe_margin:80,min_logo_gap:30,logo_box:{x:810,y:140,width:190,height:90},text_boxes:[{id:'name',box:{x:80,y:140,width:690,height:90}},{id:'slogan',box:{x:80,y:280,width:720,height:70}}]});
  assert.deepEqual(result.errors,[]);
  assert.equal(result.measurements.text_logo_gaps[0].gap,40);
});

test('hero layout rejects text that crowds or overlaps the logo',()=>{
  const crowded=auditHeroLayout({canvas:{width:1080,height:1554},logo_box:{x:810,y:140,width:190,height:90},text_boxes:[{id:'name',box:{x:80,y:140,width:710,height:90}}]});
  assert.ok(crowded.errors.includes('text_logo_gap_too_small:name'));
  const overlap=auditHeroLayout({canvas:{width:1080,height:1554},logo_box:{x:810,y:140,width:190,height:90},text_boxes:[{id:'name',box:{x:80,y:140,width:760,height:90}}]});
  assert.ok(overlap.errors.includes('text_overlaps_logo:name'));
});

test('hero layout rejects missing safe-area boxes',()=>{
  const result=auditHeroLayout({canvas:{width:1080,height:1554},logo_box:{x:950,y:140,width:100,height:90},text_boxes:[{id:'name',box:{x:40,y:140,width:600,height:90}}]});
  assert.ok(result.errors.includes('logo_outside_horizontal_safe_area'));
  assert.ok(result.errors.includes('text_outside_horizontal_safe_area:name'));
});
