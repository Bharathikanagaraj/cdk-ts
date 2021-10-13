import cdk=  require('@aws-cdk/core');
import * as ec2 from '@aws-cdk/aws-ec2';
import * as rds from '@aws-cdk/aws-rds';
import * as iam from '@aws-cdk/aws-iam';
import * as s3 from '@aws-cdk/aws-s3';
import { Port, SecurityGroup } from '@aws-cdk/aws-ec2';
import { ManagedPolicy, Policy, Role } from '@aws-cdk/aws-iam';
import { Tag } from "@aws-cdk/core";

export class EC2RDSStack extends cdk.Stack {
  
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
    
    //S3 Bucket creation
    
    const bucket = new s3.Bucket(this, 'myfirstbucket-typescript-artifact', {
      versioned: false,
      bucketName:'myfirstbucket-typescript-artifact',
      removalPolicy:cdk.RemovalPolicy.DESTROY, //to use auto removal run- "cdk bootstrap" in terminal before deploy
      autoDeleteObjects:true
    });
    //CodeBuildRole creation
    const buildRole = new iam.Role(this, "CodeBuildRole", {
      assumedBy: new iam.ServicePrincipal('codebuild.amazonaws.com'),
    })
    //CodeBuildRole creation
    new iam.Policy(this, "CodeBuildRolePolicy", {
      statements: [
        new iam.PolicyStatement({
          actions: [
            "codecommit:GitPull",
            "logs:CreateLogGroup",
            "logs:CreateLogStream",
            "logs:PutLogEvents",
            "s3:GetObject",
            "s3:GetObjectVersion",
            "s3:PutObject",
            "ssm:GetParameters"
          ],
          resources: ["*"]
        }),
      ],
      roles: [
        buildRole
      ]
    })
    //CodeDeployRole creation
    const deployRole = new iam.Role(this, "CodeDeployRole", {
      assumedBy: new iam.ServicePrincipal('codedeploy.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSCodeDeployRole"),
      ]
    })
    //Role creation for EC2
    const role = new iam.Role(this, "WebAppInstanceRole", {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName("AWSCodeDeployReadOnlyAccess"),
        iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonEC2ReadOnlyAccess")
      ]
    })
    //DeploymentInstancePolicy creation 
    new iam.Policy(this, "DeploymentInstancePolicy", {
      statements: [
        new iam.PolicyStatement({
          actions: [
            "s3:GetObject",
          ],
          resources: ["*"]
        }),
      ],
      roles: [
        role
      ]
    })
    //VPC Creation
    const vpc=new ec2.Vpc(this,'VPC-tsc',{
        cidr:'30.0.0.0/16',
        maxAzs:2,
        subnetConfiguration:[
          {
            subnetType:ec2.SubnetType.PUBLIC,
            name:'VPC-tsc-Public',
            cidrMask:24,
          },
          {
            subnetType:ec2.SubnetType.PRIVATE_ISOLATED,
            name:'VPC-tsc-Private',
            cidrMask:24,
          }
        ], 
        })
    //securitygroup for EC2
    const securitygroup = new SecurityGroup(this, 'securityGroup',{
      allowAllOutbound: true,
      vpc
    })
    //Adding Security group rules 
    securitygroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(80)
    )
    securitygroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(22)
    )
    //securitygroup for RDS
    const securitygroup1 = new SecurityGroup(this, 'securityGroup1',{
      allowAllOutbound: true,
      vpc
    })
    //Adding Security group rules 
    securitygroup1.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(443)
    )
    //Addition of UserData
    const userData = ec2.UserData.forLinux({ shebang: "#!/bin/bash -ex" });
    userData.addCommands(
      "yum install -y aws-cli",
      "yum install -y git",
      "cd /home/ec2-user/",
      "wget https://aws-codedeploy-" + cdk.Aws.REGION + ".s3.amazonaws.com/latest/codedeploy-agent.noarch.rpm",
      "yum -y install codedeploy-agent.noarch.rpm",
      "service codedeploy-agent start",
    )
    //Combining datas for public machine
    const options1 = {
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.SMALL),
      machineImage: new ec2.AmazonLinuxImage(),
      role: role,
      securityGroup: securitygroup,
      userData: userData,
      vpc: vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      instanceName:'DevWebApp01'
    };
    const options2 = {
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.SMALL),
      machineImage: new ec2.AmazonLinuxImage(),
      role: role,
      securityGroup: securitygroup,
      userData: userData,
      vpc: vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      instanceName:'PrdWebApp01'
    };
    
    //EC2 creation
    const devWeb1 = new ec2.Instance(this, "DevWebApp01", options1)
    const prdWeb1 = new ec2.Instance(this, "PrdWebApp01", options2)
    
    //...........................................................................................................
    //RDS creation
    // const instance = new rds.DatabaseInstance(this, 'rds', {
    //   engine: rds.DatabaseInstanceEngine.mysql({ version:rds.MysqlEngineVersion.VER_8_0_25 }),
      
    //   instanceType: ec2.InstanceType.of(ec2.InstanceClass.BURSTABLE3, ec2.InstanceSize.SMALL),
    //   credentials: rds.Credentials.fromGeneratedSecret('abcdef'), // Optional - will default to 'admin' username and generated password
    //   vpc:vpc,
    //   databaseName:'RDSDB',
    //   vpcSubnets: {
    //     subnetType: ec2.SubnetType.PRIVATE_ISOLATED
    //   },
    //   instanceIdentifier:'my-rds',  
    //   securityGroups: [securitygroup1],
    //   removalPolicy: cdk.RemovalPolicy.DESTROY,    
    // });
    //...........................................................................................................
    
    //BationHost creation
    // create a bastion host in the public subnet
    const bastionHost = new ec2.BastionHostLinux(this, 'BastionHost', {
      vpc,
      subnetSelection: { subnetType: ec2.SubnetType.PUBLIC },
    });
    //Security group for bation host
    const bationSecurityGroup = new ec2.SecurityGroup(this, 'BationSecurityGroup', {
      vpc,
      description: 'Allow access to ec2 instances',
      allowAllOutbound: true   // Can be set to false
    });
    bationSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(80),
      'Allows HTTP connection from bastion security group'
    );
    bationSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(22),
      'Allows SSH connection from bastion security group'
    );
    //define a user data script to enable routing at kernel level for the appliance instance
    //
    const privateInstanceRoutingUserdata = ec2.UserData.forLinux();
    privateInstanceRoutingUserdata.addCommands(
      'sysctl -w net.ipv4.ip_forward=1',
      'sysctl -w net.ipv6.conf.all.forwarding=1');
    //Private machine creation
    const privateInstance = new ec2.Instance(this, 'privateInstance', {
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.NANO),
      machineImage: new ec2.AmazonLinuxImage({ generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2 }),
      vpc: vpc,
      vpcSubnets: { subnetGroupName: 'VPC-tsc-Private'},
      instanceName: 'privateInstance',
      sourceDestCheck: false,
      securityGroup: bationSecurityGroup,
      keyName:'temp',
      userData:privateInstanceRoutingUserdata
    });
    
    // Create an IAM permission to allow the instances to connect to SSM 
    const policy = {
      Action: [
        "ssmmessages:*",
        "ssm:UpdateInstanceInformation",
        "ec2messages:*"
      ],
      Resource: "*",
      Effect: "Allow"
    }
    //Attach the policy with private instance
    privateInstance.addToRolePolicy(iam.PolicyStatement.fromJson(policy));
    //iam role creation
    // const role1 = new iam.Role(this,'simple-instance-role',{
    //   assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com') 
    // })
    // role.addManagedPolicy(ManagedPolicy.fromAwsManagedPolicyName('AmazonS3FullAccess'));

    //2.ec2-creation
    // const ec2Instance = new ec2.Instance(this, 'ec2Instance',{
    //   instanceType: ec2.InstanceType.of(ec2.InstanceClass.T2, ec2.InstanceSize.MICRO),
    //   machineImage: new ec2.AmazonLinuxImage(),
    //   vpc,
    //   role: role1,
    //   securityGroup:securitygroup1,
    //   instanceName:'EC2-CDK-Instance',
    //   //bydefault ec2 launced in private
    //   vpcSubnets:{
    //     subnetType: ec2.SubnetType.PUBLIC
    //   },
    //   keyName:'cdk',
    // })
    //getting output for ssh
    // new cdk.CfnOutput(this, 'ec2-output', {
    //   value: ec2Instance.instancePublicIp,
    // })
    //
    new cdk.CfnOutput(this, "DevLocation", {
      description: "Development web server location",
      value: "http://" + devWeb1.instancePublicDnsName
    })
    new cdk.CfnOutput(this, "PrdLocation", {
      description: "Production web server location",
      value: "http://" + prdWeb1.instancePublicDnsName
    })

    new cdk.CfnOutput(this, "BucketName", {
      description: "Bucket for storing artifacts",
      value: bucket.bucketName
    })

    new cdk.CfnOutput(this, "BuildRoleArn", {
      description: "Build role ARN",
      value: buildRole.roleArn
    })

    new cdk.CfnOutput(this, "DeployRoleArn", {
      description: "Deploy role ARN",
      value: deployRole.roleArn
    })
    
  }
}    
