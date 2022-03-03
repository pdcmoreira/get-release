const { getInput, setOutput, setFailed } = require("@actions/core");
const { getOctokit, context } = require("@actions/github");

// Try to find the latest tag matching the regex patterns
async function findMatchingTag({ octokit, context, match, exclude }) {
  match = match ? new RegExp(match) : null;
  exclude = exclude ? new RegExp(exclude) : null;

  const { owner, repo } = context.repo;
  const perPage = 10;

  let page = 1;
  let results = [];

  do {
    results = (
      await octokit.rest.repos.listTags({
        owner,
        repo,
        page,
        per_page: perPage,
      })
    ).data;

    const matched = results.find((result) => {
      return (
        (!match || match.exec(result.name)) &&
        (!exclude || !exclude.exec(result.name))
      );
    });

    if (matched) {
      return matched.name;
    }

    page++;
  } while (results.length === perPage);

  throw new Error("Could not find tag matching the specified input patterns.");
}

// Get the tag name from the triggered action
function getContextTag(context) {
  if (!context.ref.includes("refs/tags/")) {
    throw new Error(
      `Could not resolve tag from context. Ref is: ${context.ref}`
    );
  }

  // This removes the 'refs/tags' portion of the string, i.e. from 'refs/tags/v1.10.15' to 'v1.10.15'
  return context.ref.replace("refs/tags/", "");
}

async function run() {
  try {
    // Get authenticated GitHub client (Ocktokit): https://github.com/actions/toolkit/tree/master/packages/github#usage
    const token = getInput("token");

    const octokit = getOctokit(token);

    const match = getInput("match");
    const exclude = getInput("exclude");

    const tag =
      match || exclude
        ? await findMatchingTag({ octokit, context, match, exclude })
        : getContextTag({ context });

    const { owner, repo } = context.repo;

    // Get a release from the tag
    // API Documentation: https://developer.github.com/v3/repos/releases/#create-a-release
    // Octokit Documentation: https://octokit.github.io/rest.js/#octokit-routes-repos-create-release
    const getReleaseResponse = await octokit.rest.repos.getReleaseByTag({
      owner,
      repo,
      tag,
    });

    // Get the outputs for the created release from the response
    const {
      data: {
        id: releaseId,
        html_url: htmlUrl,
        upload_url: uploadUrl,
        name: name,
        body: body,
        draft: draft,
        prerelease: prerelease,
        author: author,
      },
    } = getReleaseResponse;

    console.log(
      `Got release info: '${releaseId}', '${htmlUrl}', '${uploadUrl}', '${name}', '${draft}', '${prerelease}', '${body}', '${author}'`
    );

    // Set the output variables for use by other actions: https://github.com/actions/toolkit/tree/master/packages/core#inputsoutputs
    setOutput("id", releaseId.toString());
    setOutput("html_url", htmlUrl);
    setOutput("upload_url", uploadUrl);
    setOutput("tag_name", tag);
    setOutput("name", name);
    setOutput("body", body);
    setOutput("draft", draft);
    setOutput("prerelease", prerelease);
    setOutput("author", author);
  } catch (error) {
    console.log(error);

    setFailed(error.message);
  }
}

module.exports = run;
