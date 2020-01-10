import { fromCallback } from 'bluebird';
import { expect } from 'chai';
import { before, afterEach, describe, it } from 'mocha';
import sinon from 'sinon';

import { handler, NOOP } from '../../src';
import container from '../../src/container';
import { BUILDS } from '../../src/codebuild';
import * as sns from '../fixtures/sns';

describe('basic', function () {
  before(async function () {
    const modules = await container.load({
      codebuild: 'codebuild',
      config: 'config',
    });
    Object.assign(this, modules);
    this.sandbox = sinon.createSandbox();
    this.topicArn = this.config.get('sns.topic_arn');
  });

  afterEach(function () {
    this.sandbox.restore();
  });

  it('should skip invalid messages', async function () {
    const e = sns.event(
      // invalid topic arn
      sns.record('{"foo":"bar"}', { subject: 'release', topicArn: 'test' }),
      // non json payload
      sns.record('{ hello }', { topicArn: this.topicArn }),
      // invalid eventName
      sns.record('{"foo":"bar"}', { subject: 'foo', topicArn: this.topicArn }),
      // no matching buildspec entry
      sns.record('{"action":"labeled","repository":{"name":"foo"}}', { subject: 'pull_request', topicArn: this.topicArn }),
    );
    const spy = this.sandbox.spy(this.codebuild, 'findMissingProjects');
    const result = await fromCallback(done => handler(e, {}, done));
    expect(result).to.equal(NOOP);
    expect(spy.callCount).to.equal(0);
  });

  const githubEventToCodebuildEvents = [
    {
      githubEvent: 'opened',
      merged: false,
      codebuildEvent: 'CREATED',
      envVarOverride: 'pr',
    },
    {
      githubEvent: 'reopened',
      merged: false,
      codebuildEvent: 'REOPENED',
      envVarOverride: 'pr',
    },
    {
      githubEvent: 'synchronize',
      merged: false,
      codebuildEvent: 'UPDATED',
      envVarOverride: 'pr',
    },
    {
      githubEvent: 'closed',
      merged: true,
      codebuildEvent: 'MERGED',
      envVarOverride: 'master',
    },
  ];

  githubEventToCodebuildEvents.forEach((item) => {
    it(`should start the correct builds for PR ${item.githubEvent} events (PULL_REQUEST_${item.codebuildEvent})`, async function () {
      const e = sns.event(
        sns.record(JSON.stringify({
          action: `${item.githubEvent}`,
          number: 20,
          repository: {
            name: 'BetterWorks',
          },
          merged: JSON.parse(`${item.merged}`),
        }), { subject: 'pull_request', topicArn: this.topicArn }),
      );
      const client = this.codebuild._client();
      this.sandbox.stub(client, 'batchGetProjects').returns({
        promise: sinon.stub().resolves({
          projectsNotFound: [],
        }),
      });
      this.sandbox.stub(client, 'startBuild').returns({
        promise: sinon.stub().resolves({}),
      });
      const result = await fromCallback((done) => handler(e, {}, done));
      expect(result).to.deep.equal([{}, {}, {}, {}, {}, {}]);
      expect(client.startBuild.callCount).to.equal(6);
      const startBuildCalls = client.startBuild;
      expect(startBuildCalls.args.length).to.equal(6);
      startBuildCalls.args.forEach(([params]) => {
        expect(params).to.have.property('sourceVersion', 'pr/20');
        expect(params).to.have.property('projectName');
        expect(BUILDS).to.contain(params.projectName);
        expect(params).to.have.nested.property('environmentVariablesOverride.0.name', 'BUILD_TYPE');
        expect(params).to.have.nested.property('environmentVariablesOverride.0.value', `${item.envVarOverride}`);
      });
    });
  });

  it('should start the correct build for release events', async function () {
    const e = sns.event(
      sns.record(JSON.stringify({
        action: 'published',
        release: {
          tag_name: 'v1.0.0',
        },
        repository: {
          name: 'BetterWorks',
        },
      }), { subject: 'release', topicArn: this.topicArn }),
    );
    const client = this.codebuild._client();
    this.sandbox.stub(client, 'batchGetProjects').returns({
      promise: sinon.stub().resolves({
        projectsNotFound: [],
      }),
    });
    this.sandbox.stub(client, 'startBuild').returns({
      promise: sinon.stub().resolves({}),
    });
    const result = await fromCallback(done => handler(e, {}, done));
    expect(result).to.deep.equal([{}]);
    expect(client.startBuild.callCount).to.equal(1);
    let call = client.startBuild.getCalls().find(c => /^v/g.test(c.args[0].sourceVersion));
    let params = call.args[0]; // eslint-disable-line
    expect(params).to.have.property('sourceVersion', 'v1.0.0');
    expect(params).to.have.property('projectName', 'bw-release-source');
  });
});
