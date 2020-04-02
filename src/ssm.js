/**
 * @module ssm
 * @overview expose underlying aws drivers for testing purposes
 */
import AWS from 'aws-sdk';

export const inject = {
  name: 'ssm',
};

export default function () {
  return new AWS.SSM();
}
