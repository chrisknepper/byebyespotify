import React from 'react';
import { render } from 'react-dom';
import App from './App';

var mainCss = require('./../scss/main.scss');

if (typeof window !== 'undefined') {
	window.React = React;
}

render( <App />, document.getElementById('app') );
