/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License;
 * you may not use this file except in compliance with the Elastic License.
 */

import { FtrProviderContext } from '../../../ftr_provider_context';

export default function ({ getService, getPageObjects }: FtrProviderContext) {
  const testSubjects = getService('testSubjects');
  const esArchiver = getService('esArchiver');
  const security = getService('security');
  const inspector = getService('inspector');
  const PageObjects = getPageObjects([
    'common',
    'header',
    'discover',
    'visChart',
    'security',
    'timePicker',
  ]);
  const browser = getService('browser');
  const sendToBackground = getService('sendToBackground');

  describe('discover in space', () => {
    describe('Send to background in space', () => {
      before(async () => {
        await esArchiver.load('dashboard/session_in_space');

        await security.role.create('data_analyst', {
          elasticsearch: {
            indices: [{ names: ['logstash-*'], privileges: ['all'] }],
          },
          kibana: [
            {
              feature: {
                discover: ['all'],
              },
              spaces: ['another-space'],
            },
          ],
        });

        await security.user.create('analyst', {
          password: 'analyst-password',
          roles: ['data_analyst'],
          full_name: 'test user',
        });

        await PageObjects.security.forceLogout();

        await PageObjects.security.login('analyst', 'analyst-password', {
          expectSpaceSelector: false,
        });
      });

      after(async () => {
        await security.role.delete('data_analyst');
        await security.user.delete('analyst');

        await esArchiver.unload('dashboard/session_in_space');
        await PageObjects.security.forceLogout();
      });

      it('Saves and restores a session', async () => {
        await PageObjects.common.navigateToApp('discover', { basePath: 's/another-space' });

        await PageObjects.discover.selectIndexPattern('logstash-*');

        await PageObjects.timePicker.setAbsoluteRange(
          'Sep 1, 2015 @ 00:00:00.000',
          'Oct 1, 2015 @ 00:00:00.000'
        );

        await PageObjects.discover.waitForDocTableLoadingComplete();

        await sendToBackground.expectState('completed');
        await sendToBackground.save();
        await sendToBackground.expectState('backgroundCompleted');
        await inspector.open();

        const savedSessionId = await (
          await testSubjects.find('inspectorRequestSearchSessionId')
        ).getAttribute('data-search-session-id');
        await inspector.close();

        // load URL to restore a saved session
        const url = await browser.getCurrentUrl();
        const savedSessionURL = `${url}&searchSessionId=${savedSessionId}`;
        await browser.get(savedSessionURL);
        await PageObjects.header.waitUntilLoadingHasFinished();
        await PageObjects.discover.waitForDocTableLoadingComplete();

        // Check that session is restored
        await sendToBackground.expectState('restored');
        await testSubjects.missingOrFail('embeddableErrorLabel');
      });
    });
  });
}
