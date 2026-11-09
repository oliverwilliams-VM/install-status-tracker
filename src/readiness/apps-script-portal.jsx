import React from 'react';
import {createRoot} from 'react-dom/client';
import ReadinessApp from './ReadinessApp.jsx';

const root = createRoot(document.getElementById('root'));
function recipientCall(token, request) {
  return new Promise((resolve, reject) => {
    google.script.run.withSuccessHandler(resolve).withFailureHandler(reject)
      .RD_recipientRequest(token, request);
  });
}
google.script.url.getLocation(({hash}) => {
  const token = new URLSearchParams((hash || '').replace(/^#/, '')).get('access');
  root.render(<ReadinessApp recipientToken={token} recipientCall={recipientCall}/>);
});
