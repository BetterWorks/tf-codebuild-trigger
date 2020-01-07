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

export default function (config) {
  const codebuild = new AWS.CodeBuild();


  /**
   * Tranform github event payloads into codebuild build parameters
   * @param  {Object[]} payloads    - list of github event payloads
   * @param  {Object}   options     - options
   * @param  {Object}   options.log - logger
   * @return {Object[]}
   */
  // TODO is this really a list? does an sns event contain multiple records and each is a payload?
  // TODO we need this to create multiple params (one for each project we want to kick off)
  function buildParams(payloads, { log }) {
    return payloads.reduce((acc, p) => {
      // define base parameters
      const param = {
        projectName: p.repository.name,
        buildspecOverride: p.buildspecOverride,
        environmentVariablesOverride: [{
          name: 'REPOSITORY_NAME',
          value: p.repository.name,
          type: PLAINTEXT,
        }],
      };
      // add environment variables from ssm parameter store
      const parameters = config.get('parameters', {});
      Object.keys(parameters).forEach((name) => {
        param.environmentVariablesOverride.push({
          name,
          type: PARAMETER,
          value: parameters[name],
        });
      });
      // define source version based on event name
      switch (p.eventName) {
        case 'pull_request':
          // TODO this needs to be updated to duplicate the cb functionality to determine what kind of PR event it is and kick off builds accordingly
          param.sourceVersion = `pr/${p.number}`;
          break;
        case 'release': // TODO this "should" work for the release process since that will be the semver tag that we want to use for the docker image
          param.sourceVersion = p.release.tag_name;
          break;
        default:
          log.debug({ eventName: p.eventName, name: p.repository.name }, 'unsupported event');
      }
      acc.push(param);
      return acc;
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
    return Promise.all(params.map(p => codebuild.startBuild(p).promise()));
  }

  return {
    buildParams,
    _client: () => codebuild,
    findMissingProjects,
    startBuilds,
  };
}
