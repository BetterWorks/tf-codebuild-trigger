/**
 * @module codebuild
 * @overview expose underlying aws drivers for testing purposes
 */
import AWS from 'aws-sdk';

export const inject = {
  name: 'codebuild',
  require: ['config'],
};

export const PARAMETER = 'PARAMETER_STORE';
export const PLAINTEXT = 'PLAINTEXT';
// TODO bw-cypress needs to be re-added once cypress can run in codebuild
export const BUILDS = ['bw-frontend', 'bw-backend', 'bw-ptdiff', 'bw-protractor', 'bw-cucumber', 'bw-image'];

export default function (config) {
  const codebuild = new AWS.CodeBuild();

  /**
   * Tranform github event payloads into codebuild build parameters
   * @param  {Object[]} payloads    - list of github event payloads
   * @param  {Object}   options     - options
   * @param  {Object}   options.log - logger
   * @return {Object[]}
   */
  function buildParams(payloads, { log }) {
    return payloads.reduce((acc, p) => {
      let allBuildParams = [];
      switch (p.eventName) {
        case 'pull_request':
          // eslint-disable-next-line no-case-declarations
          allBuildParams = BUILDS.map((build) => {
            return {
              projectName: build,
              sourceVersion: `pr/${p.number}`,
              environmentVariablesOverride: [{
                name: 'BUILD_TYPE',
                type: 'string',
                value: p.merged ? 'master' : 'pr',
              }],
            };
          });
          break;
        case 'release': // TODO this "should" work for the release process since that will be the semver tag that we want to use for the docker image
          // TODO this will need to call codepipeline eventually, NOT codebuild
          // param.sourceVersion = p.release.tag_name;
          break;
        default:
          log.debug({ eventName: p.eventName, name: p.repository.name }, 'unsupported event');
      }
      return allBuildParams;
    }, []);
  }

  /**
   * Filter out codebuild project names that do not exist
   * @param  {String[]} names - list of codebuild project names
   * @return {Promise}
   */
  async function findMissingProjects(names) {
    // fetch codebuild projects by name
    const { projectsNotFound } = await codebuild.batchGetProjects({
      names,
    }).promise();
    // filter out names without a corresponding codebuild project of the same
    // name
    return projectsNotFound;
  }

  /**
   * Start one or more codebuild projects
   * @param  {Object[]} params - an array containing one or more start build params
   * @return {Promise}
   */
  async function startBuilds(params) {
    return Promise.all(params.map((p) => codebuild.startBuild(p).promise()));
  }

  return {
    buildParams,
    _client: () => codebuild,
    findMissingProjects,
    startBuilds,
  };
}
