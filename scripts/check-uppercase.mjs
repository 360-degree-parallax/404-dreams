import assert from 'node:assert/strict';
import {forceUppercase,initUppercase} from '../public/uppercase.mjs';
const field={value:'abCd 한글 123',selectionStart:2,selectionEnd:4,setSelectionRange(a,b){this.selectionStart=a;this.selectionEnd=b;},closest(){return true;},matches(){return true;}};
forceUppercase(field);assert.equal(field.value,'ABCD 한글 123');assert.equal(field.selectionStart,2);assert.equal(field.selectionEnd,4);
const events={};globalThis.document={addEventListener(k,v){events[k]=v;}};initUppercase();field.value='new name';events.input({target:field,isComposing:false});assert.equal(field.value,'NEW NAME');field.value='typing';events.input({target:field,isComposing:true});assert.equal(field.value,'typing');events.compositionend({target:field});assert.equal(field.value,'TYPING');
console.log('PASS: uppercase input, stable caret, Korean text and spaces preserved, composition handling.');
