'use client';

export const NAVIGATION_REQUEST_EVENT = 'flexdocs:navigation-request';

export function requestNavigation() {
  return window.dispatchEvent(new Event(NAVIGATION_REQUEST_EVENT, { cancelable: true }));
}
